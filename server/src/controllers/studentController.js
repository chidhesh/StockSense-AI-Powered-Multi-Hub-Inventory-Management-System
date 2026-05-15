import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Student from '../models/Student.js';
import { JWT_SECRET, AI_SERVER_URL } from '../config/env.js';
import { query } from '../config/db.js';

export const register = async (req, res) => {
  const { roll_no, password } = req.body;
  try {
    const student = await Student.findByRollNo(roll_no);
    if (!student) {
      return res.status(404).json({ message: 'Student not found in registry. Please contact Center Manager.' });
    }
    if (student.is_registered) {
      return res.status(400).json({ message: 'Student already registered. Please login.' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    await Student.register(roll_no, passwordHash);
    res.status(200).json({ message: 'Registration successful. You can now login.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const login = async (req, res) => {
  const { roll_no, password } = req.body;
  try {
    const student = await Student.findByRollNo(roll_no);
    if (!student || !student.is_registered) {
      return res.status(401).json({ message: 'Invalid credentials or student not registered.' });
    }

    const isMatch = await bcrypt.compare(password, student.password_hash);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    const token = jwt.sign({ id: student.id, roll_no: student.roll_number, role: 'student' }, JWT_SECRET, { expiresIn: '1d' });
    
    // Don't send password hash
    const { password_hash, ...studentData } = student;
    res.status(200).json({ token, student: studentData });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const getDashboard = async (req, res) => {
  const { roll_no } = req.params;
  try {
    const data = await Student.getDashboardData(roll_no);
    if (!data) return res.status(404).json({ message: 'Student not found' });
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const sendOTP = async (req, res) => {
  const { roll_no } = req.body;
  try {
    const student = await Student.findByRollNo(roll_no);
    if (!student) return res.status(404).json({ message: 'Student not found' });
    
    // Simple mock OTP for now - in production, use nodemailer
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    console.log(`OTP for ${roll_no}: ${otp}`);
    
    res.status(200).json({ message: 'OTP sent to your registered email (Mocked in console)', otp });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const resetPassword = async (req, res) => {
  const { roll_no, new_password } = req.body;
  try {
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(new_password, salt);
    await Student.updatePassword(roll_no, passwordHash);
    res.status(200).json({ message: 'Password reset successful.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const recommend = async (req, res) => {
  const { text } = req.body;
  try {
    // Mock call to Flask API
    // const response = await fetch(`${AI_SERVER_URL}/predict`, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ text })
    // });
    // const data = await response.json();
    
    // Temporary mock response
    res.status(200).json({
      recommendations: [
        { component: 'Arduino Uno', reason: 'Common for IoT projects' },
        { component: 'DHT11 Sensor', reason: 'Used for temperature/humidity' }
      ]
    });
  } catch (error) {
    res.status(500).json({ message: 'AI Service error', error: error.message });
  }
};

export const getVendors = async (req, res) => {
  const { component } = req.params;
  try {
    const result = await query(
      'SELECT * FROM vendors WHERE component_name ILIKE $1 ORDER BY price ASC, rating DESC',
      [`%${component}%`]
    );
    res.status(200).json(result.rows);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const getInventory = async (req, res) => {
  const { center_id } = req.params;
  try {
    const result = await query(
      'SELECT id, name, category, available_quantity as stock, total_quantity, status FROM components WHERE center_id = $1 ORDER BY name ASC',
      [center_id]
    );
    res.status(200).json(result.rows);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const getHistory = async (req, res) => {
  const { roll_no } = req.params;
  try {
    const studentResult = await query('SELECT id FROM students WHERE roll_number = $1', [roll_no]);
    const student = studentResult.rows[0];
    if (!student) return res.status(404).json({ message: 'Student not found' });

    const result = await query(`
      SELECT t.*, c.name as component_name 
      FROM inventory_transactions t
      JOIN components c ON t.component_id = c.id
      WHERE t.student_uuid = $1 OR t.student_id = $2
      ORDER BY t.created_at DESC
    `, [student.id, roll_no]);
    
    res.status(200).json(result.rows);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
