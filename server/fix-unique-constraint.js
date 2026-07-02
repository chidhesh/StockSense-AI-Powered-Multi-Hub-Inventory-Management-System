import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

async function checkAndFixConstraints() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('Checking components table constraints...');
    
    // First, check if the unique constraint exists
    const checkConstraint = await pool.query(`
      SELECT 
        tc.constraint_name, 
        kcu.column_name 
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name
      WHERE tc.table_name = 'components'
        AND tc.constraint_type = 'UNIQUE';
    `);

    console.log('Existing unique constraints:', checkConstraint.rows);

    // If no unique constraint (name, center_id), add it
    const hasNameCenterIdConstraint = checkConstraint.rows.some(row => 
      row.column_name === 'name' || row.column_name === 'center_id'
    );

    if (!hasNameCenterIdConstraint) {
      console.log('Adding UNIQUE (name, center_id) constraint...');
      await pool.query(`
        ALTER TABLE components ADD CONSTRAINT components_name_center_id_key UNIQUE (name, center_id);
      `);
      console.log('Successfully added the unique constraint!');
    } else {
      console.log('Unique constraint already exists!');
    }
  } catch (error) {
    console.error('Error:', error);
    // Try a different approach - drop and re-add if there's an error
    try {
      console.log('Attempting to add constraint with IF NOT EXISTS...');
      await pool.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE table_name = 'components'
              AND constraint_name = 'components_name_center_id_key'
          ) THEN
            ALTER TABLE components ADD CONSTRAINT components_name_center_id_key UNIQUE (name, center_id);
          END IF;
        END
        $$;
      `);
      console.log('Successfully ensured the unique constraint exists!');
    } catch (retryError) {
      console.error('Retry failed:', retryError);
    }
  } finally {
    await pool.end();
  }
}

checkAndFixConstraints().then(() => {
  console.log('Done!');
  process.exit(0);
});
