const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || '/data/data.json';

app.use(cors());
app.use(express.json());

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize database
let db = {
  users: [],
  reservations: [],
  courts: [],
  bookingJobs: []
};

// Load existing data
if (fs.existsSync(DB_PATH)) {
  try {
    db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch (error) {
    console.log('Error loading database, using defaults');
  }
}

// Save data to file
function saveDB() {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'Tennis Court Bot API is running', timestamp: new Date().toISOString() });
});

// Auth endpoints
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  // Find or create user
  let user = db.users.find(u => u.email === email);
  if (!user) {
    user = {
      id: Date.now().toString(),
      email,
      password, // In production, this should be hashed
      createdAt: new Date().toISOString()
    };
    db.users.push(user);
    saveDB();
  } else if (user.password !== password) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  res.json({ user: { id: user.id, email: user.email }, token: `token_${user.id}` });
});

// Court availability endpoints
app.get('/api/courts', (req, res) => {
  // Mock Alice Marble courts data
  const courts = [
    {
      id: 'am_court_1',
      name: 'Alice Marble Court 1',
      location: 'Alice Marble Recreation Center',
      address: '199 Greenwich St, San Francisco, CA 94133',
      surface: 'Hard Court',
      status: 'available',
      nextAvailable: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
    },
    {
      id: 'am_court_2',
      name: 'Alice Marble Court 2',
      location: 'Alice Marble Recreation Center',
      address: '199 Greenwich St, San Francisco, CA 94133',
      surface: 'Hard Court',
      status: 'reserved',
      nextAvailable: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString()
    },
    {
      id: 'am_court_3',
      name: 'Alice Marble Court 3',
      location: 'Alice Marble Recreation Center',
      address: '199 Greenwich St, San Francisco, CA 94133',
      surface: 'Hard Court',
      status: 'available',
      nextAvailable: new Date().toISOString()
    }
  ];

  db.courts = courts;
  saveDB();
  res.json(courts);
});

// Reservations endpoints
app.get('/api/reservations', (req, res) => {
  const userReservations = db.reservations.filter(r => r.userId === req.query.userId);
  res.json(userReservations);
});

app.post('/api/reservations', (req, res) => {
  const { userId, courtId, date, time, duration } = req.body;
  
  const reservation = {
    id: Date.now().toString(),
    userId,
    courtId,
    date,
    time,
    duration: duration || 60,
    status: 'confirmed',
    createdAt: new Date().toISOString()
  };

  db.reservations.push(reservation);
  saveDB();
  res.json(reservation);
});

// Auto-booking endpoints
app.post('/api/auto-book', (req, res) => {
  const { userId, courtId, preferredTimes, daysAhead } = req.body;
  
  const job = {
    id: Date.now().toString(),
    userId,
    courtId,
    preferredTimes: preferredTimes || ['09:00', '10:00', '11:00'],
    daysAhead: daysAhead || 7,
    active: true,
    createdAt: new Date().toISOString(),
    lastAttempt: null,
    successCount: 0
  };

  db.bookingJobs.push(job);
  saveDB();
  
  console.log(`Auto-booking job created for user ${userId}, court ${courtId}`);
  res.json(job);
});

app.get('/api/auto-book/:userId', (req, res) => {
  const userJobs = db.bookingJobs.filter(j => j.userId === req.params.userId);
  res.json(userJobs);
});

app.delete('/api/auto-book/:jobId', (req, res) => {
  db.bookingJobs = db.bookingJobs.filter(j => j.id !== req.params.jobId);
  saveDB();
  res.json({ success: true });
});

// Mock booking attempt function
function attemptBooking(job) {
  console.log(`Attempting to book court ${job.courtId} for user ${job.userId}`);
  
  // Update job with attempt info
  job.lastAttempt = new Date().toISOString();
  
  // Simulate booking success/failure (80% success rate)
  const success = Math.random() > 0.2;
  
  if (success) {
    const reservation = {
      id: Date.now().toString(),
      userId: job.userId,
      courtId: job.courtId,
      date: new Date(Date.now() + job.daysAhead * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      time: job.preferredTimes[0],
      duration: 60,
      status: 'confirmed',
      createdAt: new Date().toISOString(),
      bookedBy: 'auto-bot'
    };
    
    db.reservations.push(reservation);
    job.successCount++;
    console.log(`✓ Successfully booked court ${job.courtId} for ${reservation.date} ${reservation.time}`);
  } else {
    console.log(`✗ Failed to book court ${job.courtId} - court not available`);
  }
  
  saveDB();
  return success;
}

// Cron job to check for booking opportunities every hour at reservation opening times
cron.schedule('0 8,12,18 * * *', () => {
  console.log('Running auto-booking check...');
  
  db.bookingJobs.filter(job => job.active).forEach(job => {
    attemptBooking(job);
  });
});

app.listen(PORT, () => {
  console.log(`Tennis Court Bot server running on port ${PORT}`);
});