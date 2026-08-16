import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import initSqlJs from 'sql.js';
import { pipeline } from '@xenova/transformers';
import NodeCache from 'node-cache';

const app = express();
const PORT = process.env.PORT || 3001;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.resolve(__dirname, '..', 'dist');
const dbDirectory = path.resolve(__dirname, 'data');
const dbPath = path.resolve(dbDirectory, 'civicpulse.sqlite');
const uploadDirectory = path.resolve(__dirname, 'uploads');
const cache = new NodeCache({ stdTTL: 300, checkperiod: 60 });
let visionClassifier = null;
let visionInitializationPromise = null;
const visionLabels = [
  { label: 'Road Repair', prompt: 'a pothole, cracked road, or damaged pavement' },
  { label: 'Drainage', prompt: 'an overflowing drain, blocked gutter, or open sewer' },
  { label: 'Water Supply', prompt: 'a leaking pipe, water leak, or broken water supply' },
  { label: 'Public Safety', prompt: 'a broken streetlight, unsafe public space, or exposed hazard' },
  { label: 'Waste Management', prompt: 'garbage, illegal dumping, or overflowing waste' },
  { label: 'Urban Greening', prompt: 'a fallen tree, damaged park, or neglected greenery' },
  { label: 'Traffic', prompt: 'a broken traffic signal, traffic obstruction, or damaged road sign' },
  { label: 'General Infrastructure', prompt: 'damaged public infrastructure' }
];

const seedIssues = [
  {
    id: 'issue-101',
    title: 'Broken roadside drain near market square',
    description: 'Overflowing drain is causing flooding after rain and traffic jam for pedestrians and two-wheelers.',
    category: 'Drainage',
    location: 'Market Square, Jaipur',
    lat: 26.9124,
    lng: 75.7873,
    severity: 'High',
    authenticity: 'Verified by 4 local community checks',
    affectedPeople: 320,
    status: 'Assigned to contractor',
    contractor: 'Bharat Infra Works'
  },
  {
    id: 'issue-102',
    title: 'Streetlight outage on school route',
    description: 'Several streetlights are off near the school bus stop, creating safety concerns for students.',
    category: 'Public Safety',
    location: 'School Road, Ahmedabad',
    lat: 23.0225,
    lng: 72.5714,
    severity: 'Medium',
    authenticity: 'AI confidence 88%',
    affectedPeople: 120,
    status: 'Awaiting verification',
    contractor: 'Urban Light Crew'
  },
  {
    id: 'issue-103',
    title: 'Pothole on arterial road',
    description: 'Large pothole on the lane entering the bus terminal is damaging vehicles every day.',
    category: 'Road Repair',
    location: 'Bus Terminal Road, Pune',
    lat: 18.5204,
    lng: 73.8567,
    severity: 'Medium',
    authenticity: 'Verified by 2 citizens and 1 local NGO',
    affectedPeople: 180,
    status: 'In progress',
    contractor: 'RoadCare Solutions'
  }
];

const newsItems = {
  featuredNews: [
    {
      title: 'Patron fund: 42 community backers contributed ₹3.4 lakh this week',
      type: 'Funding'
    },
    {
      title: 'District admin published transparent repair allocation for 11 priority zones',
      type: 'Policy'
    },
    {
      title: 'NGO marshalled volunteer crews to support citizen validation in 3 wards',
      type: 'Community'
    }
  ],
  patronAdvertisements: [
    {
      name: 'Bharat Smart Mobility',
      type: 'Business Patron',
      tagline: 'Supporting clean commute zones with smart lighting and signage sponsorships',
      region: 'Jaipur'
    },
    {
      name: 'Indus Institute of Urban Studies',
      type: 'Institute Patron',
      tagline: 'Research collaboration for civic technology pilots and civic data literacy',
      region: 'Ahmedabad'
    },
    {
      name: 'Saarthi Retail Hub',
      type: 'Business Patron',
      tagline: 'Community billboard campaign for public safety awareness and service access',
      region: 'Pune'
    }
  ],
  fundAllocations: [
    {
      title: 'Drainage upgrade allocation',
      amount: '₹4.8 crore',
      description: 'Funding approved for flood-prone ward drainage cleaning and smart outflow monitoring.'
    },
    {
      title: 'Streetlight modernization program',
      amount: '₹2.1 crore',
      description: 'Government allocation for safety lighting in school corridors and transit access roads.'
    },
    {
      title: 'Road repair and pothole mitigation',
      amount: '₹6.3 crore',
      description: 'District maintenance package prioritizing high-traffic routes and bus terminals.'
    }
  ]
};

fs.mkdirSync(dbDirectory, { recursive: true });
fs.mkdirSync(uploadDirectory, { recursive: true });

const SQL = await initSqlJs({
  locateFile: (file) => path.resolve(__dirname, '..', 'node_modules', 'sql.js', 'dist', file)
});

const db = fs.existsSync(dbPath)
  ? new SQL.Database(new Uint8Array(fs.readFileSync(dbPath)))
  : new SQL.Database();

function saveDatabase() {
  const binaryDatabase = db.export();
  fs.writeFileSync(dbPath, Buffer.from(binaryDatabase));
}

function initializeDatabase() {
  db.run(`
    CREATE TABLE IF NOT EXISTS issues (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT,
      location TEXT,
      lat REAL,
      lng REAL,
      severity TEXT,
      authenticity TEXT,
      affectedPeople INTEGER,
      status TEXT,
      contractor TEXT,
      summary TEXT,
      photo_url TEXT,
      created_at INTEGER NOT NULL
    )
  `);

  try {
    db.run('ALTER TABLE issues ADD COLUMN summary TEXT');
  } catch (_error) {
    // Column already exists in a previously initialized DB.
  }

  try {
    db.run('ALTER TABLE issues ADD COLUMN photo_url TEXT');
  } catch (_error) {
    // Column already exists in a previously initialized DB.
  }

  const countStatement = db.prepare('SELECT COUNT(*) as count FROM issues');
  const existingCountResult = countStatement.getAsObject();
  countStatement.free();
  const existingCount = Number(existingCountResult.count || 0);
  if (existingCount === 0) {
    seedIssues.forEach((issue) => {
      db.run(
        `INSERT OR IGNORE INTO issues (id, title, description, category, location, lat, lng, severity, authenticity, affectedPeople, status, contractor, summary, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          issue.id,
          issue.title,
          issue.description,
          issue.category,
          issue.location,
          issue.lat,
          issue.lng,
          issue.severity,
          issue.authenticity,
          issue.affectedPeople,
          issue.status,
          issue.contractor,
          `${issue.title}. ${issue.description}`.slice(0, 180),
          Date.now()
        ]
      );
    });
    saveDatabase();
  }
}

function issueRowToObject(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    location: row.location,
    lat: Number(row.lat),
    lng: Number(row.lng),
    severity: row.severity,
    authenticity: row.authenticity,
    affectedPeople: Number(row.affectedPeople),
    status: row.status,
    contractor: row.contractor,
    summary: row.summary || '',
    photoUrl: row.photo_url || ''
  };
}

function getIssuesFromDatabase() {
  const statement = db.prepare('SELECT * FROM issues ORDER BY created_at DESC');
  const rows = [];
  while (statement.step()) {
    rows.push(statement.getAsObject());
  }
  statement.free();
  return rows.map(issueRowToObject);
}

function initializeVisionStack() {
  if (!visionInitializationPromise) {
    visionInitializationPromise = pipeline('zero-shot-image-classification', 'Xenova/clip-vit-base-patch32')
      .then((classifier) => {
        visionClassifier = classifier;
        return classifier;
      })
      .catch((error) => {
        visionInitializationPromise = null;
        throw error;
      });
  }
  return visionInitializationPromise;
}

function parseImageData(imageData) {
  const matches = /^data:(image\/(?:jpeg|png|webp));base64,([a-zA-Z0-9+/=]+)$/.exec(imageData || '');
  if (!matches) throw new Error('Please upload a JPG, PNG, or WebP image.');

  const buffer = Buffer.from(matches[2], 'base64');
  if (!buffer.length || buffer.length > 5 * 1024 * 1024) {
    throw new Error('Image must be smaller than 5 MB.');
  }

  const extension = matches[1] === 'image/jpeg' ? 'jpg' : matches[1].split('/')[1];
  return { buffer, extension };
}

function createIssueTitle(category) {
  const titles = {
    'Road Repair': 'Road damage reported from photo',
    Drainage: 'Drainage issue reported from photo',
    'Water Supply': 'Water supply issue reported from photo',
    'Public Safety': 'Public safety hazard reported from photo',
    'Waste Management': 'Waste management issue reported from photo',
    'Urban Greening': 'Urban greenery issue reported from photo',
    Traffic: 'Traffic infrastructure issue reported from photo',
    'General Infrastructure': 'Public infrastructure issue reported from photo'
  };
  return titles[category] || titles['General Infrastructure'];
}

function imageSeverity(category) {
  if (category === 'Drainage' || category === 'Public Safety') return 'High';
  if (['Road Repair', 'Water Supply', 'Traffic', 'Waste Management'].includes(category)) return 'Medium';
  return 'Low';
}

async function analyzeIssueImage(imageData) {
  const imageHash = crypto.createHash('sha256').update(imageData).digest('hex');
  const cacheKey = `image-analysis:${imageHash}`;
  const cachedAnalysis = cache.get(cacheKey);
  if (cachedAnalysis) return cachedAnalysis;

  const { buffer, extension } = parseImageData(imageData);
  const temporaryPath = path.join(uploadDirectory, `analysis-${imageHash}.${extension}`);
  fs.writeFileSync(temporaryPath, buffer);

  try {
    const classifier = await initializeVisionStack();
    const results = await classifier(temporaryPath, visionLabels.map((item) => item.prompt));
    const match = results?.[0];
    const matchedLabel = visionLabels.find((item) => item.prompt === match?.label);
    const category = matchedLabel?.label || 'General Infrastructure';
    const confidence = Math.round((match?.score || 0) * 100);
    const analysis = {
      category,
      confidence,
      severity: imageSeverity(category),
      title: createIssueTitle(category),
      summary: `AI detected ${category.toLowerCase()} from the uploaded photo with ${confidence}% confidence.`
    };
    cache.set(cacheKey, analysis, 3600);
    return analysis;
  } finally {
    fs.rmSync(temporaryPath, { force: true });
  }
}

initializeDatabase();

app.use(cors());
app.use(express.json({ limit: '7mb' }));
app.use('/uploads', express.static(uploadDirectory));

app.get('/api/health', (_req, res) => {
  res.json({
    healthy: true,
    services: ['express', 'leaflet-ui', 'sqlite-persistence', 'cache-layer'],
    database: {
      status: 'ready',
      file: dbPath
    },
    cache: {
      enabled: true,
      ttlSeconds: 300
    },
    vision: {
      provider: 'CLIP zero-shot image classification',
      status: visionClassifier ? 'ready' : 'loaded on first image analysis'
    }
  });
});

app.get('/api/issues', (_req, res) => {
  const cacheKey = 'issues';
  const cachedIssues = cache.get(cacheKey);
  if (cachedIssues) {
    return res.json(cachedIssues);
  }

  const issues = getIssuesFromDatabase();
  cache.set(cacheKey, issues);
  return res.json(issues);
});

app.post('/api/analyze-image', async (req, res) => {
  try {
    const analysis = await analyzeIssueImage(req.body?.imageData);
    res.json(analysis);
  } catch (error) {
    console.error('Image analysis failed:', error.message);
    res.status(422).json({ message: 'Unable to analyze this image. Please use a clear JPG, PNG, or WebP photo.' });
  }
});

app.post('/api/issues', async (req, res) => {
  const { imageData, location, lat, lng } = req.body || {};
  if (!imageData || !location) {
    return res.status(400).json({ message: 'an image and location are required' });
  }

  let visionAnalysis;
  let image;
  try {
    visionAnalysis = await analyzeIssueImage(imageData);
    image = parseImageData(imageData);
  } catch (error) {
    return res.status(422).json({ message: error.message || 'Unable to analyze this image.' });
  }

  const imageFileName = `${Date.now()}-${crypto.randomUUID()}.${image.extension}`;
  fs.writeFileSync(path.join(uploadDirectory, imageFileName), image.buffer);
  const photoUrl = `/uploads/${imageFileName}`;
  const description = visionAnalysis.summary;
  const newIssue = {
    id: `issue-${Date.now()}`,
    title: visionAnalysis.title,
    description,
    category: visionAnalysis.category,
    location,
    lat: Number(lat) || 28.6139,
    lng: Number(lng) || 77.209,
    severity: visionAnalysis.severity,
    authenticity: `AI image confidence ${visionAnalysis.confidence}% with manual review pending`,
    affectedPeople: visionAnalysis.category === 'Public Safety' ? 200 : visionAnalysis.category === 'Drainage' ? 350 : 95,
    status: 'Awaiting contractor allotment',
    contractor: 'Pending allocation',
    summary: visionAnalysis.summary,
    photoUrl
  };

  db.run(
    `INSERT INTO issues (id, title, description, category, location, lat, lng, severity, authenticity, affectedPeople, status, contractor, summary, photo_url, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      newIssue.id,
      newIssue.title,
      newIssue.description,
      newIssue.category,
      newIssue.location,
      newIssue.lat,
      newIssue.lng,
      newIssue.severity,
      newIssue.authenticity,
      newIssue.affectedPeople,
      newIssue.status,
      newIssue.contractor,
      newIssue.summary,
      newIssue.photoUrl,
      Date.now()
    ]
  );
  saveDatabase();
  cache.del('issues');
  cache.del('dashboard');

  res.status(201).json({ message: 'Issue submitted and classified', issue: newIssue });
});

app.delete('/api/issues/:id', (req, res) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ message: 'Issue id is required' });
  }

  const existingIssueStatement = db.prepare('SELECT photo_url FROM issues WHERE id = ?');
  existingIssueStatement.bind([id]);
  const existingIssue = existingIssueStatement.step() ? existingIssueStatement.getAsObject() : null;
  existingIssueStatement.free();

  const result = db.run('DELETE FROM issues WHERE id = ?', [id]);
  if (result.changes === 0) {
    return res.status(404).json({ message: 'Issue not found' });
  }

  if (existingIssue?.photo_url) {
    fs.rmSync(path.join(uploadDirectory, path.basename(existingIssue.photo_url)), { force: true });
  }

  saveDatabase();
  cache.del('issues');
  cache.del('dashboard');

  res.json({ message: 'Issue removed successfully' });
});

app.get('/api/dashboard', (_req, res) => {
  const cachedDashboard = cache.get('dashboard');
  if (cachedDashboard) {
    return res.json(cachedDashboard);
  }

  const issues = getIssuesFromDatabase();
  const counts = {
    openIssues: issues.length,
    highSeverity: issues.filter((issue) => issue.severity === 'High').length,
    verified: issues.filter((issue) => issue.authenticity.includes('Verified')).length,
    funding: '₹8.5L collected'
  };

  const revenue = [
    { channel: 'Citizen subscriptions', value: '₹2.2L' },
    { channel: 'Business & institution patrons', value: '₹3.8L' },
    { channel: 'Government & NGO funding', value: '₹2.5L' }
  ];

  const severityRank = { High: 3, Medium: 2, Low: 1 };
  const priorityQueue = [...issues]
    .sort((a, b) => (severityRank[b.severity] ?? 0) - (severityRank[a.severity] ?? 0))
    .slice(0, 3);

  const dashboard = { counts, revenue, priorityQueue };
  cache.set('dashboard', dashboard);
  res.json(dashboard);
});

app.get('/api/news', (_req, res) => {
  const cachedNews = cache.get('news');
  if (cachedNews) {
    return res.json(cachedNews);
  }

  cache.set('news', newsItems);
  res.json(newsItems);
});

app.use(express.static(distPath));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
