import mysql, { RowDataPacket, ResultSetHeader } from 'mysql2';
import bodyParser from 'body-parser';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import express, { Request, Response } from 'express';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();
const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// MySQL connection
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
});

db.connect((err) => {
  if (err) throw err;
  console.log('Connected to MySQL');
});

// Multer setup for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'src/uploads');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  },
});

const upload = multer({ storage });

// POST
app.post('/upload', upload.single('image'), (req: Request, res: Response): void => {
  const filePath = req.file ? req.file.filename : null;
  const category = req.body.category;
  const description = req.body.description;

  if (!filePath) {
    res.status(400).json({ message: 'No file uploaded' });
    return;
  }

  if (!category) {
    res.status(400).json({ message: 'Category is required' });
    return;
  }

  const sql = 'INSERT INTO images (path, category, description) VALUES (?, ?, ?)';
  console.log('Полученное описание:', description);
  db.query(sql, [filePath, category, description || ''], (err, result) => {
    if (err) throw err;
    const resultSetHeader = result as mysql.OkPacket;
    res.json({ message: 'Image uploaded successfully', id: resultSetHeader.insertId });
  });
});

// GET
app.get('/images', (req: Request, res: Response) => {
  const { category } = req.query;

  let sql = 'SELECT id, path, category, description FROM images';
  const params: string[] = [];

  if (category) {
    sql += ' WHERE category = ?';
    params.push(category as string);
  }

  db.query(sql, params, (err, results) => {
    if (err) throw err;
    res.json(results);
  });
});


//DELETE
app.delete('/images/:id', (req: Request, res: Response) => {
  const imageId = req.params.id;

  // Удаляем запись из базы данных
  const sql = 'SELECT path FROM images WHERE id = ?';
  db.query(sql, [imageId], (err, result: any[]) => {
    if (err) {
      res.status(500).json({ message: 'Error fetching image path' });
      return;
    }

    if (result.length === 0) {
      res.status(404).json({ message: 'Image not found' });
      return;
    }

    const imagePath = path.join(__dirname, 'uploads', result[0].path);

    // Удаляем файл с сервера
    fs.unlink(imagePath, (err) => {
      if (err) {
        res.status(500).json({ message: 'Error deleting file' });
        return;
      }

      // Удаляем запись из базы данных
      const deleteSql = 'DELETE FROM images WHERE id = ?';
      db.query(deleteSql, [imageId], (err) => {
        if (err) {
          res.status(500).json({ message: 'Error deleting record' });
          return;
        }

        res.json({ message: 'Image deleted successfully' });
      });
    });
  });
});


// // PUT
// app.put('/images/:id', (req: Request, res: Response) => {
//   const { id } = req.params;
//   const { newPath } = req.body;

//   const sql = 'UPDATE images SET path = ? WHERE id = ?';
//   db.query(sql, [newPath, id], (err, result) => {
//     if (err) {
//       res.status(500).json({ message: 'Error updating image path' });
//       return;
//     }

//     if (result.affectedRows === 0) {
//       res.status(404).json({ message: 'Image not found' });
//       return;
//     }

//     res.json({ message: 'Image updated successfully' });
//   });
// });



//Для бронирование POST

app.post('/bookings', (req: Request, res: Response): void => {
  const { checkin_date, checkout_date, guests, promo_code } = req.body;

  if (
    !checkin_date ||
    !checkout_date ||
    typeof guests !== 'number' ||
    typeof promo_code !== 'boolean'
  ) {
    res.status(400).json({ message: 'Invalid data' });
    return;
  }

  const sql = `
      INSERT INTO bookings (checkin_date, checkout_date, guests, promo_code)
      VALUES (?, ?, ?, ?)
  `;

  const values = [checkin_date, checkout_date, guests, promo_code ? 1 : 0];

  console.log('Executing SQL:', sql, values);

  db.query(sql, values, (err, result) => {
    if (err) {
      console.error('Error inserting booking:', err);
      res.status(500).json({ message: 'Database error' });
      return;
    }

    res
      .status(201)
      .json({ message: 'Booking created successfully', id: (result as mysql.OkPacket).insertId });
  });
});

app.get('/bookings', (req: Request, res: Response): void => {
  const sql = 'SELECT * FROM bookings';

  console.log('Executing SQL:', sql); // ✅ Посмотреть в консоли, выполняется ли запрос

  db.query(sql, (err, results) => {
    if (err) {
      console.error('❌ Ошибка при получении бронирований:', err);
      res.status(500).json({ message: 'Database error' });
      return;
    }

    console.log('✅ Данные из MySQL:', results); // ✅ Проверить, какие данные приходят
    res.json(results);
  });
});

// Секретный ключ для JWT
const SECRET_KEY = 'your_secret_key';

// Регистрация
//@ts-ignore
app.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password required' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const sql = 'INSERT INTO users (username, password) VALUES (?, ?)';

    db.query<ResultSetHeader>(sql, [username, hashedPassword], (err, result) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ message: 'Error registering user' });
      }

      // Создаем JWT-токен после регистрации
      const token = jwt.sign({ id: result.insertId, username }, SECRET_KEY, { expiresIn: '1h' });
      res.status(201).json({ message: 'Пользователь зарегистрирован', token, username });
    });
  } catch (error) {
    console.error('Error in register route:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Логин
app.post('/login', (req: Request, res: Response) => {
  const { username, password } = req.body;

  const sql = 'SELECT * FROM users WHERE username = ?';
  db.query<RowDataPacket[]>(sql, [username], async (err, results) => {
    if (err || results.length === 0) {
      return res.status(401).json({ message: 'Неверные данные' });
    }

    const user = results[0] as RowDataPacket;
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ message: 'Неверные данные' });
    }

    const token = jwt.sign({ id: user.id, username: user.username }, SECRET_KEY, {
      expiresIn: '1h',
    });
    res.json({ token, username: user.username });
  });
});

// Start server
const PORT = 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
