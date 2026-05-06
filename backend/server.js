const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const multer    = require('multer');
const path      = require('path');
const fs        = require('fs');
const { Pool }  = require('pg');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── DB ──
const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     process.env.DB_PORT     || 5432,
  database: process.env.DB_NAME     || 'portfolio',
  user:     process.env.DB_USER     || 'hasham',
  password: process.env.DB_PASS     || 'hasham123',
});

// ── MIDDLEWARE ──
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: '*' }));
app.use(express.json());

// ── UPLOADS DIR ──
const UPLOADS = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS)) fs.mkdirSync(UPLOADS, { recursive: true });
app.use('/api/uploads', express.static(UPLOADS));

// ── MULTER ──
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS),
  destination: (req, file, cb) => cb(null, UPLOADS),
  filename:    (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random()*1e9);
    cb(null, `proj_${req.params.id}_${unique}${path.extname(file.originalname)}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    cb(null, allowed.test(file.mimetype));
  }
});

// ── INIT DB ──
async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id          SERIAL PRIMARY KEY,
        title       TEXT NOT NULL,
        category    TEXT NOT NULL,
        description TEXT,
        tags        TEXT[],
        emoji       TEXT DEFAULT '🔧',
        image_url   TEXT,
        created_at  TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS contacts (
        id         SERIAL PRIMARY KEY,
        name       TEXT NOT NULL,
        email      TEXT NOT NULL,
        subject    TEXT,
        message    TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS visitors (
        id         SERIAL PRIMARY KEY,
        visited_at TIMESTAMPTZ DEFAULT NOW(),
        ip         TEXT
      );
    `);

    // Seed default projects if empty
    const { rows } = await client.query('SELECT COUNT(*) FROM projects');
    if (parseInt(rows[0].count) === 0) {
      const defaults = [
        [1,'Core Banking K8s Infrastructure','kubernetes','Built and managed a 400+ node production Kubernetes cluster from scratch for Bank Al Habib.','{Kubernetes,kubeadm,HA,"Core Banking"}','☸️'],
        [2,'Thanos Monitoring Architecture','observability','Scalable Prometheus Operator with sharding + Thanos for long-term metrics storage and federation.','{Prometheus,Thanos,Grafana,Kiali}','📊'],
        [3,'Rook-Ceph Distributed Storage','storage','Deployed Rook-Ceph enabling resilient CephFS PVCs for stateful workloads beyond single-node limits.','{Rook-Ceph,CephFS,PVC,StatefulSets}','💾'],
        [4,'ELK Centralized Logging','observability','Multi-node Elasticsearch + Filebeat on all nodes. Kibana HA for log visualization in production.','{Elasticsearch,Filebeat,Kibana,ELK}','🔍'],
        [5,'Istio Ambient Mesh Migration','kubernetes','Migrated to Istio Ambient mode — ~50% memory reduction while maintaining full mTLS security.','{Istio,Ambient,mTLS,"Service Mesh"}','🕸️'],
        [6,'Node Provisioning Automation','cicd','Automated scripts for Kubernetes worker node provisioning with containerd, kubeadm, kubelet, kubectl.','{Bash,containerd,kubeadm,Automation}','🔄'],
      ];
      for (const [id,title,cat,desc,tags,emoji] of defaults) {
        await client.query(
          'INSERT INTO projects(id,title,category,description,tags,emoji) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING',
          [id,title,cat,desc,tags,emoji]
        );
      }
      await client.query("SELECT setval('projects_id_seq', 10)");
      console.log('✅ Seeded default projects');
    }
    console.log('✅ Database ready');
  } finally {
    client.release();
  }
}

// ── ROUTES ──

// Health
app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

// GET all projects
app.get('/api/projects', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM projects ORDER BY id');
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Upload project image
app.post('/api/projects/:id/image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file' });
    const filename = req.file.filename;
    await pool.query('UPDATE projects SET image_url=$1 WHERE id=$2', [filename, req.params.id]);
    res.json({ image_url: filename, message: 'Image uploaded successfully' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST contact
app.post('/api/contact', async (req, res) => {
  const { name, email, subject, message } = req.body;
  if (!name || !email || !message)
    return res.status(400).json({ error: 'name, email, message required' });
  try {
    await pool.query(
      'INSERT INTO contacts(name,email,subject,message) VALUES($1,$2,$3,$4)',
      [name, email, subject || '', message]
    );
    res.json({ message: 'Message saved successfully' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET contacts (admin)
app.get('/api/contacts', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM contacts ORDER BY created_at DESC');
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST visitor (increment)
app.post('/api/visitors', async (req, res) => {
  try {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    await pool.query('INSERT INTO visitors(ip) VALUES($1)', [ip]);
    res.json({ message: 'Recorded' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET visitor count
app.get('/api/visitors', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT COUNT(*) FROM visitors');
    res.json({ count: parseInt(rows[0].count) });
  } catch (e) {
    res.status(500).json({ count: 0 });
  }
});

// ── START ──
initDB()
  .then(() => {
    app.listen(PORT, () => console.log(`🚀 Backend running on port ${PORT}`));
  })
  .catch(err => {
    console.error('❌ DB init failed:', err.message);
    // Still start server — DB might come up later
    app.listen(PORT, () => console.log(`🚀 Backend running (DB not ready) on port ${PORT}`));
  });
