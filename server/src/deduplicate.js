import pool from './config/db.js';

async function cleanupDuplicates() {
  console.log('Starting inventory deduplication process...');
  
  try {
    // 1. Identify all unique names (case-insensitive) and their aggregated quantities
    const { rows: duplicates } = await pool.query(`
      SELECT 
        LOWER(TRIM(name)) as normalized_name,
        COUNT(*) as count,
        SUM(total_quantity) as total_q,
        SUM(available_quantity) as avail_q,
        (array_agg(id))[1] as primary_id,
        MIN(name) as display_name,
        (array_agg(category))[1] as category,
        (array_agg(center_id))[1] as center_id
      FROM components
      GROUP BY LOWER(TRIM(name))
      HAVING COUNT(*) > 1
    `);

    console.log(`Found ${duplicates.length} groups of duplicate components.`);

    for (const dup of duplicates) {
      console.log(`Merging ${dup.count} entries for "${dup.display_name}"...`);

      // Update the "primary" record with the summed quantities
      await pool.query(`
        UPDATE components 
        SET 
          total_quantity = $1,
          available_quantity = $2,
          name = $3,
          updated_at = NOW()
        WHERE id = $4
      `, [dup.total_q, dup.avail_q, dup.display_name, dup.primary_id]);

      // Delete the other records in this name group
      await pool.query(`
        DELETE FROM components 
        WHERE LOWER(TRIM(name)) = $1 
        AND id != $2
      `, [dup.normalized_name, dup.primary_id]);
      
      console.log(`Successfully merged "${dup.display_name}". New total: ${dup.total_q}, Available: ${dup.avail_q}`);
    }

    console.log('Deduplication complete.');
    process.exit(0);
  } catch (error) {
    console.error('Deduplication failed:', error);
    process.exit(1);
  }
}

cleanupDuplicates();