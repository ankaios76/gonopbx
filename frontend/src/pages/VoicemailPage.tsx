import { useState, useEffect } from 'react';
import axios from 'axios';
import VoicemailPlayer from '../components/VoicemailPlayer';
import './VoicemailPage.css';

interface Voicemail {
  id: number;
  mailbox: string;
  caller_id: string;
  duration: number;
  date: string;
  is_read: boolean;
  file_path: string;
}

interface VoicemailStats {
  total: number;
  unread: number;
  by_mailbox: Record<string, number>;
}

const VoicemailPage = () => {
  const [voicemails, setVoicemails] = useState<Voicemail[]>([]);
  const [stats, setStats] = useState<VoicemailStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedMailbox, setSelectedMailbox] = useState<string>('all');
  const [selectedVoicemail, setSelectedVoicemail] = useState<Voicemail | null>(null);
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);

  useEffect(() => {
    fetchVoicemails();
    fetchStats();
  }, [selectedMailbox, showUnreadOnly]);

  const fetchVoicemails = async () => {
    try {
      setLoading(true);
      const params: any = {};
      if (selectedMailbox !== 'all') {
        params.mailbox = selectedMailbox;
      }
      if (showUnreadOnly) {
        params.unread_only = true;
      }

      const response = await axios.get('/api/voicemail/', { params });
      console.log('API Response:', response.data);
      
      // API gibt direktes Array zurück
      const data = Array.isArray(response.data) ? response.data : [];
      setVoicemails(data);
    } catch (error) {
      console.error('Error fetching voicemails:', error);
      setVoicemails([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await axios.get('/api/voicemail/stats');
      setStats(response.data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const handleMarkAsRead = async (id: number) => {
    try {
      await axios.patch(`/api/voicemail/${id}/mark-read`);
      fetchVoicemails();
      fetchStats();
    } catch (error) {
      console.error('Error marking as read:', error);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Voicemail wirklich löschen?')) return;

    try {
      await axios.delete(`/api/voicemail/${id}`);
      setVoicemails(voicemails.filter(vm => vm.id !== id));
      if (selectedVoicemail?.id === id) {
        setSelectedVoicemail(null);
      }
      fetchStats();
    } catch (error) {
      console.error('Error deleting voicemail:', error);
    }
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) {
      return `vor ${diffMins} Min.`;
    } else if (diffHours < 24) {
      return `vor ${diffHours} Std.`;
    } else if (diffDays < 7) {
      return `vor ${diffDays} Tag${diffDays > 1 ? 'en' : ''}`;
    } else {
      return date.toLocaleDateString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
  };

  const mailboxes = stats ? ['all', ...Object.keys(stats.by_mailbox)] : ['all'];

  return (
    <div className="voicemail-page">
      <div className="page-header">
        <h1>Voicemail</h1>
        <div className="stats-summary">
          {stats && (
            <>
              <div className="stat-badge">
                <span className="stat-label">Gesamt:</span>
                <span className="stat-value">{stats.total}</span>
              </div>
              <div className="stat-badge unread">
                <span className="stat-label">Ungelesen:</span>
                <span className="stat-value">{stats.unread}</span>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="voicemail-container">
        <div className="voicemail-sidebar">
          <div className="filter-section">
            <h3>Mailboxen</h3>
            <div className="mailbox-list">
              {mailboxes.map(mailbox => (
                <button
                  key={mailbox}
                  className={`mailbox-item ${selectedMailbox === mailbox ? 'active' : ''}`}
                  onClick={() => setSelectedMailbox(mailbox)}
                >
                  <span className="mailbox-name">
                    {mailbox === 'all' ? 'Alle Mailboxen' : `Mailbox ${mailbox}`}
                  </span>
                  {mailbox !== 'all' && stats?.by_mailbox[mailbox] && (
                    <span className="mailbox-count">{stats.by_mailbox[mailbox]}</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="filter-section">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={showUnreadOnly}
                onChange={(e) => setShowUnreadOnly(e.target.checked)}
              />
              <span>Nur ungelesene anzeigen</span>
            </label>
          </div>
        </div>

        <div className="voicemail-content">
          {loading ? (
            <div className="loading-state">
              <div className="spinner"></div>
              <p>Lade Voicemails...</p>
            </div>
          ) : voicemails.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📭</div>
              <h3>Keine Voicemails</h3>
              <p>
                {showUnreadOnly 
                  ? 'Keine ungelesenen Voicemails vorhanden.'
                  : 'Es sind keine Voicemails vorhanden.'}
              </p>
            </div>
          ) : (
            <div className="voicemail-list">
              {voicemails.map(vm => (
                <div
                  key={vm.id}
                  className={`voicemail-item ${!vm.is_read ? 'unread' : ''} ${selectedVoicemail?.id === vm.id ? 'selected' : ''}`}
                  onClick={() => {
                    setSelectedVoicemail(vm);
                    if (!vm.is_read) {
                      handleMarkAsRead(vm.id);
                    }
                  }}
                >
                  <div className="voicemail-header">
                    <div className="voicemail-info">
                      {!vm.is_read && <span className="unread-badge">Neu</span>}
                      <span className="caller-id">{vm.caller_id || 'Unbekannt'}</span>
                      <span className="mailbox-badge">Box {vm.mailbox}</span>
                    </div>
                    <div className="voicemail-meta">
                      <span className="date">{formatDate(vm.date)}</span>
                      <span className="duration">{formatDuration(vm.duration)}</span>
                    </div>
                  </div>

                  {selectedVoicemail?.id === vm.id && (
                    <div className="voicemail-player-wrapper">
                      <VoicemailPlayer
                        voicemail={vm}
                        onDelete={() => handleDelete(vm.id)}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VoicemailPage;
