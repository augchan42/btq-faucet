const Database = require('better-sqlite3');
const path = require('path');

class FaucetDB {
  constructor(dbPath = path.join(__dirname, 'faucet.db')) {
    this.db = new Database(dbPath);
    this.initDB();
  }

  initDB() {
    // Create challenges table (legacy)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS challenges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        challenge_id TEXT UNIQUE NOT NULL,
        nonce TEXT NOT NULL,
        difficulty INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        ip_hash TEXT NOT NULL,
        solved INTEGER DEFAULT 0,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      );
    `);

    // Create claims table (legacy)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS claims (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        address TEXT NOT NULL,
        ip_hash TEXT NOT NULL,
        amount REAL NOT NULL,
        txid TEXT,
        timestamp INTEGER DEFAULT (strftime('%s', 'now')),
        status TEXT DEFAULT 'pending'
      );
    `);

    // Create sessions table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT UNIQUE NOT NULL,
        address TEXT NOT NULL,
        nonce TEXT NOT NULL,
        base_difficulty INTEGER NOT NULL,
        current_difficulty INTEGER NOT NULL,
        active_seconds INTEGER DEFAULT 0,
        last_share_at INTEGER,
        last_counter INTEGER DEFAULT -1,
        started_at INTEGER NOT NULL,
        stopped_at INTEGER,
        accrued REAL DEFAULT 0,
        status TEXT DEFAULT 'active',
        ip_hash TEXT
      );
    `);

    // Create shares table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS shares (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        counter INTEGER NOT NULL,
        difficulty INTEGER NOT NULL,
        timestamp INTEGER DEFAULT (strftime('%s', 'now'))
      );
    `);

    // Create payouts table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS payouts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        address TEXT NOT NULL,
        amount REAL NOT NULL,
        txid TEXT,
        timestamp INTEGER DEFAULT (strftime('%s', 'now')),
        status TEXT DEFAULT 'pending'
      );
    `);

    // Create indexes
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_challenges_challenge_id ON challenges(challenge_id);
      CREATE INDEX IF NOT EXISTS idx_challenges_expires ON challenges(expires_at, solved);
      CREATE INDEX IF NOT EXISTS idx_claims_address ON claims(address, timestamp);
      CREATE INDEX IF NOT EXISTS idx_claims_ip_hash ON claims(ip_hash, timestamp);
      CREATE INDEX IF NOT EXISTS idx_sessions_session_id ON sessions(session_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_address_status ON sessions(address, status);
      CREATE INDEX IF NOT EXISTS idx_shares_session_id ON shares(session_id, timestamp);
      CREATE INDEX IF NOT EXISTS idx_payouts_session_id ON payouts(session_id);
      CREATE INDEX IF NOT EXISTS idx_payouts_address ON payouts(address, timestamp);
    `);
  }

  insertChallenge(challenge) {
    const stmt = this.db.prepare(`
      INSERT INTO challenges (challenge_id, nonce, difficulty, expires_at, ip_hash)
      VALUES (?, ?, ?, ?, ?)
    `);
    return stmt.run(
      challenge.challengeId,
      challenge.nonce,
      challenge.difficulty,
      challenge.expiresAt,
      challenge.ipHash
    );
  }

  getChallenge(challengeId) {
    const stmt = this.db.prepare('SELECT * FROM challenges WHERE challenge_id = ?');
    return stmt.get(challengeId);
  }

  markChallengeSolved(challengeId) {
    const stmt = this.db.prepare('UPDATE challenges SET solved = 1 WHERE challenge_id = ?');
    return stmt.run(challengeId);
  }

  insertClaim(claim) {
    const stmt = this.db.prepare(`
      INSERT INTO claims (address, ip_hash, amount, txid, status)
      VALUES (?, ?, ?, ?, ?)
    `);
    return stmt.run(
      claim.address,
      claim.ipHash,
      claim.amount,
      claim.txid,
      claim.status
    );
  }

  getLastClaim(address) {
    const stmt = this.db.prepare(`
      SELECT * FROM claims
      WHERE address = ?
      ORDER BY timestamp DESC
      LIMIT 1
    `);
    return stmt.get(address);
  }

  countIPClaims(ipHash, sinceTimestamp) {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM claims
      WHERE ip_hash = ? AND timestamp > ?
    `);
    return stmt.get(ipHash, sinceTimestamp).count;
  }

  insertSession(session) {
    const stmt = this.db.prepare(`
      INSERT INTO sessions (
        session_id,
        address,
        nonce,
        base_difficulty,
        current_difficulty,
        started_at,
        ip_hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    return stmt.run(
      session.sessionId,
      session.address,
      session.nonce,
      session.baseDifficulty,
      session.currentDifficulty,
      session.startedAt,
      session.ipHash
    );
  }

  getActiveSessionByAddress(address) {
    const stmt = this.db.prepare(`
      SELECT * FROM sessions
      WHERE address = ? AND status = 'active'
      ORDER BY started_at DESC
      LIMIT 1
    `);
    return stmt.get(address);
  }

  getSession(sessionId) {
    const stmt = this.db.prepare('SELECT * FROM sessions WHERE session_id = ?');
    return stmt.get(sessionId);
  }

  updateSessionShare(sessionId, updates) {
    const stmt = this.db.prepare(`
      UPDATE sessions
      SET last_share_at = ?,
          last_counter = ?,
          active_seconds = ?,
          current_difficulty = ?,
          accrued = ?
      WHERE session_id = ?
    `);

    return stmt.run(
      updates.lastShareAt,
      updates.lastCounter,
      updates.activeSeconds,
      updates.currentDifficulty,
      updates.accrued,
      sessionId
    );
  }

  stopSession(sessionId, updates) {
    const stmt = this.db.prepare(`
      UPDATE sessions
      SET stopped_at = ?,
          active_seconds = ?,
          current_difficulty = ?,
          accrued = ?,
          status = 'stopped'
      WHERE session_id = ?
    `);

    return stmt.run(
      updates.stoppedAt,
      updates.activeSeconds,
      updates.currentDifficulty,
      updates.accrued,
      sessionId
    );
  }

  resumeSession(sessionId) {
    const stmt = this.db.prepare(`
      UPDATE sessions
      SET status = 'active',
          stopped_at = NULL
      WHERE session_id = ? AND status = 'stopped'
    `);

    return stmt.run(sessionId);
  }

  markSessionClaimed(sessionId, updates) {
    const stmt = this.db.prepare(`
      UPDATE sessions
      SET status = 'claimed',
          stopped_at = COALESCE(stopped_at, ?)
      WHERE session_id = ?
    `);

    return stmt.run(
      updates.claimedAt,
      sessionId
    );
  }

  expireSession(sessionId, updates) {
    const stmt = this.db.prepare(`
      UPDATE sessions
      SET status = 'expired',
          stopped_at = COALESCE(stopped_at, ?)
      WHERE session_id = ?
    `);

    return stmt.run(updates.expiredAt, sessionId);
  }

  expireStaleSessions(cutoffTimestamp) {
    const stmt = this.db.prepare(`
      UPDATE sessions
      SET status = 'expired',
          stopped_at = COALESCE(stopped_at, strftime('%s', 'now'))
      WHERE status = 'active'
        AND COALESCE(last_share_at, started_at) < ?
    `);

    return stmt.run(cutoffTimestamp);
  }

  insertShare(share) {
    const stmt = this.db.prepare(`
      INSERT INTO shares (session_id, counter, difficulty)
      VALUES (?, ?, ?)
    `);

    return stmt.run(
      share.sessionId,
      share.counter,
      share.difficulty
    );
  }

  insertPayout(payout) {
    const stmt = this.db.prepare(`
      INSERT INTO payouts (session_id, address, amount, txid, status)
      VALUES (?, ?, ?, ?, ?)
    `);

    return stmt.run(
      payout.sessionId,
      payout.address,
      payout.amount,
      payout.txid,
      payout.status
    );
  }

  cleanupExpired() {
    const oneHourAgo = Math.floor(Date.now() / 1000) - 3600;
    const stmt = this.db.prepare('DELETE FROM challenges WHERE expires_at < ?');
    return stmt.run(oneHourAgo);
  }

  close() {
    this.db.close();
  }
}

module.exports = FaucetDB;
