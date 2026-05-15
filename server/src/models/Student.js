import { query } from '../config/db.js';

class Student {
  static async findByRollNo(rollNo) {
    const result = await query('SELECT * FROM students WHERE roll_number = $1', [rollNo]);
    return result.rows[0];
  }

  static async findById(id) {
    const result = await query('SELECT * FROM students WHERE id = $1', [id]);
    return result.rows[0];
  }

  static async register(rollNo, passwordHash) {
    const result = await query(
      'UPDATE students SET password_hash = $1, is_registered = true, updated_at = NOW() WHERE roll_number = $2 RETURNING *',
      [passwordHash, rollNo]
    );
    return result.rows[0];
  }

  static async updatePassword(rollNo, passwordHash) {
    const result = await query(
      'UPDATE students SET password_hash = $1, updated_at = NOW() WHERE roll_number = $2 RETURNING *',
      [passwordHash, rollNo]
    );
    return result.rows[0];
  }

  static async getDashboardData(rollNo) {
    // Get student info
    const studentResult = await query('SELECT id, full_name, roll_number, branch FROM students WHERE roll_number = $1', [rollNo]);
    const student = studentResult.rows[0];
    if (!student) return null;

    // Get transaction stats
    const statsResult = await query(`
      SELECT 
        COALESCE(SUM(quantity) FILTER (WHERE transaction_type = 'issue'), 0) as issued,
        COALESCE(SUM(quantity) FILTER (WHERE transaction_type = 'return'), 0) as returned,
        (COALESCE(SUM(quantity) FILTER (WHERE transaction_type = 'issue'), 0) - 
         COALESCE(SUM(quantity) FILTER (WHERE transaction_type = 'return'), 0)) as pending
      FROM inventory_transactions 
      WHERE student_uuid = $1 OR student_id = $2
    `, [student.id, student.roll_number]);

    // Get recent activity
    const activityResult = await query(`
      SELECT t.*, c.name as component_name 
      FROM inventory_transactions t
      JOIN components c ON t.component_id = c.id
      WHERE t.student_uuid = $1 OR t.student_id = $2
      ORDER BY t.created_at DESC
      LIMIT 10
    `, [student.id, student.roll_number]);

    // Get current inventory (items held)
    const inventoryResult = await query(`
      SELECT c.id, c.name, c.category, SUM(CASE WHEN t.transaction_type = 'issue' THEN t.quantity ELSE -t.quantity END) as held_quantity
      FROM inventory_transactions t
      JOIN components c ON t.component_id = c.id
      WHERE t.student_uuid = $1 OR t.student_id = $2
      GROUP BY c.id, c.name, c.category
      HAVING SUM(CASE WHEN t.transaction_type = 'issue' THEN t.quantity ELSE -t.quantity END) > 0
    `, [student.id, student.roll_number]);

    return {
      student,
      stats: statsResult.rows[0],
      recent_activity: activityResult.rows,
      inventory: inventoryResult.rows
    };
  }
}

export default Student;
