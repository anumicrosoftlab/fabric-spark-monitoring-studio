'use client';

import { useState, useRef, useEffect } from 'react';
import {
  Button,
  Textarea,
  Spinner,
  Badge,
  Tooltip,
} from '@fluentui/react-components';
import {
  PlugConnected24Regular,
  PlugDisconnected24Regular,
  Delete24Regular,
  Info24Regular,
} from '@fluentui/react-icons';
import styles from './page.module.css';
import { useEventHub, ConnectionStatus } from '@/lib/useEventHub';

const SAMPLE_CONNECTION_STRING = `Endpoint=sb://your-namespace.servicebus.windows.net/;SharedAccessKeyName=your-key-name;SharedAccessKey=your-key;EntityPath=your-eventhub-name`;

export default function Home() {
  const [connectionString, setConnectionString] = useState('');
  const {
    status,
    messages,
    error,
    messageCount,
    connect,
    disconnect,
    clearMessages,
  } = useEventHub(200);
  
  const streamEndRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Auto-scroll to latest message
  useEffect(() => {
    if (autoScroll && streamEndRef.current) {
      streamEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, autoScroll]);

  const handleConnect = async () => {
    if (status === 'connected' || status === 'connecting') {
      disconnect();
    } else {
      await connect(connectionString);
    }
  };

  const getStatusColor = (s: ConnectionStatus) => {
    switch (s) {
      case 'connected': return 'success';
      case 'connecting': return 'warning';
      case 'error': return 'danger';
      default: return 'informative';
    }
  };

  const getStatusText = (s: ConnectionStatus) => {
    switch (s) {
      case 'connected': return 'Connected';
      case 'connecting': return 'Connecting...';
      case 'error': return 'Error';
      default: return 'Disconnected';
    }
  };

  const formatTimestamp = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
    });
  };

  return (
    <div className={styles.container}>
      {/* Main Content */}
      <main className={styles.mainContent}>
        {/* Connection Panel */}
        <aside className={styles.connectionPanel}>
          <h2 className={styles.sectionTitle}>
            <PlugConnected24Regular />
            Connection
          </h2>

          <div className={styles.inputGroup}>
            <label className={styles.label}>Event Hub Connection String</label>
            <Textarea
              className={styles.connectionInput}
              placeholder={SAMPLE_CONNECTION_STRING}
              value={connectionString}
              onChange={(e) => setConnectionString(e.target.value)}
              disabled={status === 'connected' || status === 'connecting'}
              resize="vertical"
            />
          </div>

          <div className={styles.helpText}>
            <Tooltip
              content="The connection string should include Endpoint, SharedAccessKeyName, SharedAccessKey, and EntityPath"
              relationship="description"
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginBottom: '0.5rem' }}>
                <Info24Regular style={{ fontSize: '14px' }} />
                Connection string format:
              </span>
            </Tooltip>
            <code>Endpoint=sb://...;SharedAccessKeyName=...;SharedAccessKey=...;EntityPath=...</code>
          </div>

          {/* Status Section */}
          <div className={styles.statusSection}>
            <div className={styles.statusRow}>
              <span
                className={`${styles.statusDot} ${status === 'connected' ? styles.connected : ''} ${status === 'connecting' ? styles.connecting : ''} ${status === 'error' ? styles.error : ''}`}
              />
              <span className={styles.statusLabel}>Status:</span>
              <Badge appearance="filled" color={getStatusColor(status)}>
                {getStatusText(status)}
              </Badge>
            </div>
            <div className={styles.statusRow}>
              <span className={styles.statusLabel}>Messages received:</span>
              <span className={styles.statusValue}>{messageCount}</span>
            </div>
            {error && (
              <div className={styles.statusRow}>
                <span className={styles.statusLabel} style={{ color: '#c42b1c' }}>
                  Error: {error}
                </span>
              </div>
            )}
          </div>

          {/* Buttons */}
          <div className={styles.buttonGroup}>
            <Button
              appearance={status === 'connected' ? 'secondary' : 'primary'}
              icon={
                status === 'connecting' ? (
                  <Spinner size="tiny" />
                ) : status === 'connected' ? (
                  <PlugDisconnected24Regular />
                ) : (
                  <PlugConnected24Regular />
                )
              }
              onClick={handleConnect}
              disabled={status === 'connecting' || (!connectionString && status !== 'connected')}
              style={{ flex: 1 }}
            >
              {status === 'connected' ? 'Disconnect' : status === 'connecting' ? 'Connecting...' : 'Connect'}
            </Button>
            <Button
              appearance="subtle"
              icon={<Delete24Regular />}
              onClick={clearMessages}
              disabled={messages.length === 0}
            >
              Clear
            </Button>
          </div>
        </aside>

        {/* Stream Panel */}
        <section className={styles.streamPanel}>
          <div className={styles.streamHeader}>
            <h2 className={styles.streamTitle}>
              📺 Live Stream
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={autoScroll}
                  onChange={(e) => setAutoScroll(e.target.checked)}
                />
                Auto-scroll
              </label>
              <span className={styles.messageCount}>
                {messages.length} messages
              </span>
            </div>
          </div>

          <div className={styles.streamContent}>
            {messages.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>📭</div>
                <div className={styles.emptyText}>
                  <p>No messages yet</p>
                  <p style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>
                    Connect to an Event Hub to start streaming data
                  </p>
                </div>
              </div>
            ) : (
              <>
                {[...messages].reverse().map((msg) => (
                  <div key={msg.id} className={styles.messageItem}>
                    <div className={styles.messageMeta}>
                      <span className={styles.messageTimestamp}>
                        ⏱️ {formatTimestamp(msg.timestamp)}
                      </span>
                      <span className={styles.messagePartition}>
                        📦 Partition: {msg.partitionId}
                      </span>
                      <span className={styles.messageOffset}>
                        #️⃣ Seq: {msg.sequenceNumber}
                      </span>
                    </div>
                    <pre className={styles.messageBody}>{msg.body}</pre>
                  </div>
                ))}
                <div ref={streamEndRef} />
              </>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
