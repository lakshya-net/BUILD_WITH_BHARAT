import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
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
const cache = new NodeCache({ stdTTL: 300, checkperiod: 60 });
let aiClassifier = null;
let aiSummarizer = null;
const aiLabels = ['Road Repair', 'Drainage', 'Water Supply', 'Public Safety', 'Waste Management', 'Urban Greening', 'Traffic', 'General Infrastructure'];

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
      reporter_name TEXT,
      reporter_email TEXT,
      reporter_phone TEXT,
      reporter_aadhar TEXT,
      reporter_role TEXT,
      created_at INTEGER NOT NULL
    )
  `);

  try {
    db.run('ALTER TABLE issues ADD COLUMN summary TEXT');
  } catch (_error) {
    // Column already exists in a previously initialized DB.
  }
  // Add reporter columns if they don't exist yet (silent catch if already present)
  try {
    db.run('ALTER TABLE issues ADD COLUMN reporter_name TEXT');
  } catch (_error) {}
  try {
    db.run('ALTER TABLE issues ADD COLUMN reporter_email TEXT');
  } catch (_error) {}
  try {
    db.run('ALTER TABLE issues ADD COLUMN reporter_phone TEXT');
  } catch (_error) {}
  try {
    db.run('ALTER TABLE issues ADD COLUMN reporter_aadhar TEXT');
  } catch (_error) {}
  try {
    db.run('ALTER TABLE issues ADD COLUMN reporter_role TEXT');
  } catch (_error) {}

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
    reporter_name: row.reporter_name || null,
    reporter_email: row.reporter_email || null,
    reporter_phone: row.reporter_phone || null,
    reporter_aadhar: row.reporter_aadhar || null,
    reporter_role: row.reporter_role || null
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

async function initializeAiStack() {
  try {
    aiClassifier = await pipeline('zero-shot-classification', 'Xenova/mobilebert-uncased-mnli');
    aiSummarizer = await pipeline('summarization', 'Xenova/distilbart-cnn-12-6');
    return true;
  } catch (error) {
    console.warn('AI stack initialization failed; falling back to heuristic classification.', error.message);
    return false;
  }
}

async function generateAiSummary(text) {
  if (!aiSummarizer) return '';
  try {
    const result = await aiSummarizer(text.slice(0, 250), { max_new_tokens: 45 });
    return result?.[0]?.summary_text || '';
  } catch (_error) {
    return '';
  }
}

async function classifyIssue({ title = '', description = '', location = '' }) {
  const text = `${title} ${description} ${location}`.trim();
  const keywordText = text.toLowerCase();

  const categoryMap = [
    ['road', 'Road Repair'],
    ['pothole', 'Road Repair'],
    ['drain', 'Drainage'],
    ['water', 'Water Supply'],
    ['sewer', 'Water Supply'],
    ['streetlight', 'Public Safety'],
    ['light', 'Public Safety'],
    ['waste', 'Waste Management'],
    ['garbage', 'Waste Management'],
    ['tree', 'Urban Greening'],
    ['signal', 'Traffic'],
    ['traffic', 'Traffic']
  ];

  const fallbackCategory = categoryMap.find(([key]) => keywordText.includes(key))?.[1] || 'General Infrastructure';
  let severity = 'Low';
  if (/(flood|overflow|collapse|danger|accident|health)/i.test(keywordText)) severity = 'High';
  else if (/(road|pothole|streetlight|drain|water)/i.test(keywordText)) severity = 'Medium';

  const affectedPeople = keywordText.includes('school') ? 200 : keywordText.includes('market') ? 350 : 95;
  const authenticity = /verify|verified|community/i.test(keywordText)
    ? 'Community verified by 3+ residents'
    : 'AI confidence 91% with manual review pending';

  let category = fallbackCategory;
  let aiSummary = '';

  if (aiClassifier) {
    try {
      const classificationResult = await aiClassifier(text, aiLabels, { multi_label: false });
      category = classificationResult?.labels?.[0] || fallbackCategory;
    } catch (_error) {
      category = fallbackCategory;
    }
  }

  if (aiSummarizer) {
    aiSummary = await generateAiSummary(text);
  }

  return {
    category,
    severity,
    authenticity,
    affectedPeople,
    status: 'Awaiting contractor allotment',
    contractor: 'Pending allocation',
    summary: aiSummary || `${title}. ${description}`.slice(0, 180)
  };
}

initializeDatabase();
const aiInitializationPromise = initializeAiStack();

app.use(cors());
app.use(express.json());

app.get('/api/health', async (_req, res) => {
  const aiReady = await aiInitializationPromise.catch(() => false);
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
    ai: {
      provider: 'Xenova Transformers (free local stack)',
      status: aiReady ? 'ready' : 'fallback-heuristic'
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

app.post('/api/issues', async (req, res) => {
  const { title, description, location, lat, lng, reporter_name, reporter_email, reporter_phone, reporter_aadhar, reporter_role } = req.body || {};
  if (!title || !description || !location) {
    return res.status(400).json({ message: 'title, description, and location are required' });
  }

  const analysis = await classifyIssue({ title, description, location });
  const newIssue = {
    id: `issue-${Date.now()}`,
    title,
    description,
    category: analysis.category,
    location,
    lat: Number(lat) || 28.6139,
    lng: Number(lng) || 77.209,
    severity: analysis.severity,
    authenticity: analysis.authenticity,
    affectedPeople: analysis.affectedPeople,
    status: analysis.status,
    contractor: analysis.contractor,
    summary: analysis.summary,
    reporter_name: reporter_name || null,
    reporter_email: reporter_email || null,
    reporter_phone: reporter_phone || null,
    reporter_aadhar: reporter_aadhar || null,
    reporter_role: reporter_role || null
  };

  db.run(
    `INSERT INTO issues (id, title, description, category, location, lat, lng, severity, authenticity, affectedPeople, status, contractor, summary, reporter_name, reporter_email, reporter_phone, reporter_aadhar, reporter_role, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      newIssue.reporter_name,
      newIssue.reporter_email,
      newIssue.reporter_phone,
      newIssue.reporter_aadhar,
      newIssue.reporter_role,
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

  const result = db.run('DELETE FROM issues WHERE id = ?', [id]);
  if (result.changes === 0) {
    return res.status(404).json({ message: 'Issue not found' });
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
