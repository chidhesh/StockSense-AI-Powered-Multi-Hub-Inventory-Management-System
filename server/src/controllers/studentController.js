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
  const { text, title, description } = req.body;
  const projectText = text || `${title || ''} ${description || ''}`;
  
  try {
    // 1. Fetch ALL unique component names from the global registry (all centers)
    const { rows: globalComponents } = await query(
      'SELECT DISTINCT name, category FROM components'
    );

    // 2. Simple matching logic based on keywords if AI service is not available
    const keywords = projectText.toLowerCase().split(/\s+/);
    const recommendations = [];

    const categoryKeywords = {
      'Microcontrollers': ['arduino', 'esp32', 'raspberry', 'pi', 'uno', 'nano', 'mcu', 'controller'],
      'Sensors': ['sensor', 'dht11', 'ultrasonic', 'motion', 'pir', 'gas', 'smoke', 'temperature', 'humidity', 'ir'],
      'Displays': ['lcd', 'oled', 'display', 'screen', 'led', '7 segment', 'monitor'],
      'Motors': ['motor', 'servo', 'stepper', 'pump', 'driver', 'l298n'],
      'IoT Modules': ['wifi', 'bluetooth', 'gsm', 'lora', 'gps', 'sim800', 'esp8266', 'cloud'],
      'Power Supply': ['battery', 'adapter', 'power', 'voltage', 'regulator', 'buck', 'boost', 'solar'],
      'Cables & Connectors': ['jumper', 'wire', 'cable', 'breadboard', 'connector', 'header']
    };

    // Find components that match title/description keywords
    globalComponents.forEach(comp => {
      const compName = comp.name.toLowerCase();
      const compCat = comp.category;
      
      // Check if component name is in project text
      const nameMatch = keywords.some(k => k.length > 2 && compName.includes(k));
      
      // Check if any category keywords are in project text
      const catKeywords = categoryKeywords[compCat] || [];
      const catMatch = keywords.some(k => catKeywords.includes(k));

      if (nameMatch || catMatch) {
        if (!recommendations.find(r => r.component === comp.name)) {
          recommendations.push({
            component: comp.name,
            reason: nameMatch ? `Directly related to your project keywords` : `Essential ${compCat} for this type of project`
          });
        }
      }
    });

    // If no specific matches, provide general essentials
    if (recommendations.length < 3) {
      const essentials = ['Arduino Uno R3', 'Breadboard 830 Points', 'Jumper Wires M-M'];
      essentials.forEach(e => {
        if (!recommendations.find(r => r.component === e)) {
          recommendations.push({ component: e, reason: 'Fundamental requirement for most IoT prototypes' });
        }
      });
    }

    res.status(200).json({ recommendations: recommendations.slice(0, 5) });
  } catch (error) {
    res.status(500).json({ message: 'Recommendation error', error: error.message });
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
