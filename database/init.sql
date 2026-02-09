-- Database initialization for Asterisk PBX GUI
-- Version: 1.0 - PoC

-- Users Table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100),
    role VARCHAR(20) DEFAULT 'user',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- SIP Peers Table
CREATE TABLE IF NOT EXISTS sip_peers (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    extension VARCHAR(20) UNIQUE NOT NULL,
    secret VARCHAR(100) NOT NULL,
    caller_id VARCHAR(100),
    context VARCHAR(50) DEFAULT 'internal',
    host VARCHAR(50) DEFAULT 'dynamic',
    nat VARCHAR(20) DEFAULT 'force_rport,comedia',
    type VARCHAR(20) DEFAULT 'friend',
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Extensions/Phone Numbers Table
CREATE TABLE IF NOT EXISTS extensions (
    id SERIAL PRIMARY KEY,
    extension VARCHAR(20) UNIQUE NOT NULL,
    description VARCHAR(255),
    type VARCHAR(20) DEFAULT 'internal', -- internal, external, queue, ivr
    destination VARCHAR(100),
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Call Detail Records (CDR) Table
CREATE TABLE IF NOT EXISTS cdr (
    id SERIAL PRIMARY KEY,
    call_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    clid VARCHAR(80),
    src VARCHAR(80),
    dst VARCHAR(80),
    dcontext VARCHAR(80),
    channel VARCHAR(80),
    dstchannel VARCHAR(80),
    lastapp VARCHAR(80),
    lastdata VARCHAR(80),
    duration INTEGER,
    billsec INTEGER,
    disposition VARCHAR(45),
    amaflags INTEGER,
    uniqueid VARCHAR(150),
    userfield VARCHAR(255)
);

-- System Settings Table
CREATE TABLE IF NOT EXISTS system_settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT,
    description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_cdr_call_date ON cdr(call_date);
CREATE INDEX IF NOT EXISTS idx_cdr_src ON cdr(src);
CREATE INDEX IF NOT EXISTS idx_cdr_dst ON cdr(dst);
CREATE INDEX IF NOT EXISTS idx_sip_peers_extension ON sip_peers(extension);
CREATE INDEX IF NOT EXISTS idx_extensions_extension ON extensions(extension);

-- Insert default admin user (password: admin123 - CHANGE IN PRODUCTION!)
-- Password hash is bcrypt of 'admin123'
INSERT INTO users (username, email, password_hash, full_name, role) 
VALUES (
    'admin', 
    'admin@localhost', 
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5oPzJQvJvQKVi',
    'Administrator',
    'admin'
) ON CONFLICT (username) DO NOTHING;

-- Insert default system settings
INSERT INTO system_settings (key, value, description) VALUES
    ('system_name', 'Asterisk PBX GUI', 'Name of the PBX system'),
    ('asterisk_version', '18', 'Asterisk version'),
    ('gui_version', '0.1.0-poc', 'GUI version')
ON CONFLICT (key) DO NOTHING;

-- Insert test SIP peers
INSERT INTO sip_peers (extension, secret, caller_id, user_id) VALUES
    ('1000', 'test1000', 'Test User 1000', NULL),
    ('1001', 'test1001', 'Test User 1001', NULL)
ON CONFLICT (extension) DO NOTHING;

-- Grant permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO asterisk;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO asterisk;
