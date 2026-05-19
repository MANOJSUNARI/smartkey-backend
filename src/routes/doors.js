const router = require('express').Router();
const pool = require('../db');
const auth = require('../middleware/auth');
const bcrypt = require('bcrypt');

// ── Check if logged-in user owns this door ───────────────────────────────────
async function isDoorOwner(doorId, userId) {
  const result = await pool.query(
    `SELECT id, owner_id FROM doors WHERE id = $1`,
    [doorId]
  );
  return result.rows[0] && result.rows[0].owner_id === userId;
}

// ── Register a new door ──────────────────────────────────────────────────────
router.post('/register', auth, async (req, res) => {
  const { door_name, password } = req.body;

  if (!door_name || !password) {
    return res.status(400).json({ error: 'Door name and password are required' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO doors (name, owner_id, password, is_open)
       VALUES ($1, $2, $3, FALSE)
       RETURNING id, name, owner_id, is_open`,
      [door_name, req.user.id, hashedPassword]
    );

    res.status(201).json({
      message: 'Door registered successfully',
      door: result.rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Login / access a door by name and password ───────────────────────────────
router.post('/login', auth, async (req, res) => {
  const { name, password } = req.body;

  if (!name || !password) {
    return res.status(400).json({ error: 'Door name and password are required' });
  }

  try {
    const result = await pool.query(
      `SELECT id AS door_id, name, password, is_open, owner_id
       FROM doors WHERE name = $1 LIMIT 1`,
      [name.trim()]
    );

    const door = result.rows[0];
    if (!door) return res.status(401).json({ error: 'Invalid door name or password' });

    const match = await bcrypt.compare(password, door.password);
    if (!match) return res.status(401).json({ error: 'Invalid door name or password' });

    res.json({
      door_id: door.door_id,
      name: door.name,
      is_open: door.is_open,
      owner_id: door.owner_id,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Get door status for Arduino (no auth needed) ─────────────────────────────
router.get('/status/:door_id', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT is_open FROM doors WHERE id = $1',
      [req.params.door_id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Door not found' });
    res.json({ is_open: result.rows[0].is_open });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Arduino confirms it has physically acted (no auth needed) ─────────────────
router.post('/confirm/:door_id', async (req, res) => {
  try {
    await pool.query(
      'UPDATE doors SET arduino_confirmed = TRUE WHERE id = $1',
      [req.params.door_id]
    );
    res.json({ message: 'Confirmed' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── App polls this to check if Arduino confirmed ──────────────────────────────
router.get('/confirmed/:door_id', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT arduino_confirmed FROM doors WHERE id = $1',
      [req.params.door_id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Door not found' });
    res.json({ confirmed: result.rows[0].arduino_confirmed });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── User requests access to a door ──────────────────────────────────────────
router.post('/request-access', auth, async (req, res) => {
  const { door_id } = req.body;

  try {
    const existingAccess = await pool.query(
      `SELECT * FROM door_access WHERE door_id = $1 AND user_id = $2`,
      [door_id, req.user.id]
    );

    if (existingAccess.rows.length > 0) {
      return res.status(400).json({ error: 'You already have access to this door' });
    }

    const result = await pool.query(
      `INSERT INTO door_access_requests (door_id, user_id, status)
       VALUES ($1, $2, 'pending')
       ON CONFLICT (door_id, user_id)
       DO UPDATE SET status = 'pending', updated_at = NOW()
       RETURNING *`,
      [door_id, req.user.id]
    );

    res.status(201).json({
      message: 'Access request sent to door owner',
      request: result.rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Owner sees pending requests as notifications ─────────────────────────────
router.get('/notifications/requests', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
        dar.id AS request_id, dar.status, dar.created_at, dar.updated_at,
        d.id AS door_id, d.name AS door_name,
        u.id AS user_id, u.full_name, u.email
       FROM door_access_requests dar
       JOIN doors d ON dar.door_id = d.id
       JOIN users u ON dar.user_id = u.id
       WHERE d.owner_id = $1 AND dar.status = 'pending'
       ORDER BY dar.created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Owner approves request ───────────────────────────────────────────────────
router.put('/requests/:requestId/approve', auth, async (req, res) => {
  const { requestId } = req.params;

  try {
    const requestResult = await pool.query(
      `SELECT dar.*, d.owner_id FROM door_access_requests dar
       JOIN doors d ON dar.door_id = d.id WHERE dar.id = $1`,
      [requestId]
    );

    const request = requestResult.rows[0];
    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (request.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the door owner can approve this request' });
    }

    await pool.query(
      `INSERT INTO door_access (door_id, user_id, approved_by)
       VALUES ($1, $2, $3) ON CONFLICT (door_id, user_id) DO NOTHING`,
      [request.door_id, request.user_id, req.user.id]
    );

    const updatedRequest = await pool.query(
      `UPDATE door_access_requests SET status = 'approved', updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [requestId]
    );

    res.json({ message: 'Access approved', request: updatedRequest.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Owner rejects request ────────────────────────────────────────────────────
router.put('/requests/:requestId/reject', auth, async (req, res) => {
  const { requestId } = req.params;

  try {
    const requestResult = await pool.query(
      `SELECT dar.*, d.owner_id FROM door_access_requests dar
       JOIN doors d ON dar.door_id = d.id WHERE dar.id = $1`,
      [requestId]
    );

    const request = requestResult.rows[0];
    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (request.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the door owner can reject this request' });
    }

    await pool.query(
      `DELETE FROM door_access WHERE door_id = $1 AND user_id = $2`,
      [request.door_id, request.user_id]
    );

    const updatedRequest = await pool.query(
      `UPDATE door_access_requests SET status = 'rejected', updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [requestId]
    );

    res.json({ message: 'Access rejected', request: updatedRequest.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Owner removes approved user access ──────────────────────────────────────
router.delete('/:doorId/users/:userId', auth, async (req, res) => {
  const { doorId, userId } = req.params;

  try {
    const owner = await isDoorOwner(doorId, req.user.id);
    if (!owner) return res.status(403).json({ error: 'Only the door owner can remove users' });

    await pool.query(`DELETE FROM door_access WHERE door_id = $1 AND user_id = $2`, [doorId, userId]);
    await pool.query(
      `UPDATE door_access_requests SET status = 'rejected', updated_at = NOW()
       WHERE door_id = $1 AND user_id = $2`, [doorId, userId]
    );

    res.json({ message: 'User access removed successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Door information ─────────────────────────────────────────────────────────
router.get('/info/:door_id', auth, async (req, res) => {
  try {
    const doorResult = await pool.query(
      `SELECT id, name, is_open, owner_id FROM doors WHERE id = $1`,
      [req.params.door_id]
    );

    const door = doorResult.rows[0];
    if (!door) return res.json(null);

    const approvedUsers = await pool.query(
      `SELECT da.id AS access_id, u.id AS user_id, u.full_name, u.email, da.created_at AS approved_at
       FROM door_access da JOIN users u ON da.user_id = u.id
       WHERE da.door_id = $1 ORDER BY da.created_at DESC`,
      [door.id]
    );

    const requests = await pool.query(
      `SELECT dar.id AS request_id, dar.status, dar.created_at, dar.updated_at,
              u.id AS user_id, u.full_name, u.email
       FROM door_access_requests dar JOIN users u ON dar.user_id = u.id
       WHERE dar.door_id = $1 ORDER BY dar.created_at DESC`,
      [door.id]
    );

    res.json({
      door,
      approved_users: approvedUsers.rows,
      requests: requests.rows,
      is_owner: door.owner_id === req.user.id,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Open door ────────────────────────────────────────────────────────────────
router.post('/open', auth, async (req, res) => {
  const { door_id } = req.body;

  try {
    const owner = await isDoorOwner(door_id, req.user.id);
    const access = await pool.query(
      `SELECT * FROM door_access WHERE door_id = $1 AND user_id = $2`,
      [door_id, req.user.id]
    );

    if (!owner && access.rows.length === 0) {
      return res.status(403).json({ error: 'Access not approved by door owner' });
    }

    // Reset arduino_confirmed so app waits for Arduino to confirm
    await pool.query(
      'UPDATE doors SET is_open = TRUE, arduino_confirmed = FALSE WHERE id = $1',
      [door_id]
    );
    await pool.query(
      'INSERT INTO door_logs (user_id, door_id, action) VALUES ($1, $2, $3)',
      [req.user.id, door_id, 'open']
    );

    res.json({ success: true, message: 'Door opened' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Close door ───────────────────────────────────────────────────────────────
router.post('/close', auth, async (req, res) => {
  const { door_id } = req.body;

  try {
    const owner = await isDoorOwner(door_id, req.user.id);
    const access = await pool.query(
      `SELECT * FROM door_access WHERE door_id = $1 AND user_id = $2`,
      [door_id, req.user.id]
    );

    if (!owner && access.rows.length === 0) {
      return res.status(403).json({ error: 'Access not approved by door owner' });
    }

    // Reset arduino_confirmed so app waits for Arduino to confirm
    await pool.query(
      'UPDATE doors SET is_open = FALSE, arduino_confirmed = FALSE WHERE id = $1',
      [door_id]
    );
    await pool.query(
      'INSERT INTO door_logs (user_id, door_id, action) VALUES ($1, $2, $3)',
      [req.user.id, door_id, 'close']
    );

    res.json({ success: true, message: 'Door closed' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Door logs ────────────────────────────────────────────────────────────────
router.get('/logs/:door_id', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.full_name AS username, dl.action, dl.timestamp, d.name AS door
       FROM door_logs dl
       LEFT JOIN users u ON dl.user_id = u.id
       JOIN doors d ON dl.door_id = d.id
       WHERE dl.door_id = $1 ORDER BY dl.timestamp DESC`,
      [req.params.door_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── My access request statuses ───────────────────────────────────────────────
router.get('/my-requests', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT dar.id AS request_id, dar.status, dar.created_at, dar.updated_at,
              d.id AS door_id, d.name AS door_name
       FROM door_access_requests dar
       JOIN doors d ON dar.door_id = d.id
       WHERE dar.user_id = $1 ORDER BY dar.updated_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Get my registered doors ──────────────────────────────────────────────────
router.get('/my-doors', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, is_open FROM doors WHERE owner_id = $1 ORDER BY id DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Delete a door (owner only) ───────────────────────────────────────────────
router.delete('/:doorId', auth, async (req, res) => {
  const { doorId } = req.params;

  try {
    const owner = await isDoorOwner(doorId, req.user.id);
    if (!owner) return res.status(403).json({ error: 'Only the door owner can delete this door' });

    await pool.query('DELETE FROM doors WHERE id = $1', [doorId]);
    res.json({ message: 'Door deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;