'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { AzureSASCredential } from '@azure/core-auth';
import { EventHubProducerClient } from '@azure/event-hubs';
import {
  parseConnectionString,
  validateConnectionString,
  Authorization,
} from './eventHubUtils';

export type ProducerStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface HeartbeatMessage {
  ProducerName: string;
  Timestamp: string;
  Healthy: boolean;
}

export interface UseEventHubProducerReturn {
  status: ProducerStatus;
  error: string | null;
  lastSentMessage: HeartbeatMessage | null;
  messagesSent: number;
  connect: (connectionString: string) => Promise<void>;
  disconnect: () => void;
  sendHeartbeat: (producerName: string) => Promise<boolean>;
}

const SAS_TOKEN_TTL_SECONDS = 3600; // 1 hour

export function useEventHubProducer(): UseEventHubProducerReturn {
  const [status, setStatus] = useState<ProducerStatus>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const [lastSentMessage, setLastSentMessage] = useState<HeartbeatMessage | null>(null);
  const [messagesSent, setMessagesSent] = useState(0);

  const producerClientRef = useRef<EventHubProducerClient | null>(null);
  const isConnectingRef = useRef(false);
  const connectionInfoRef = useRef<ReturnType<typeof parseConnectionString> | null>(null);

  const disconnect = useCallback(async () => {
    console.log('[EventHubProducer] Disconnecting...');
    
    try {
      if (producerClientRef.current) {
        await producerClientRef.current.close();
        producerClientRef.current = null;
      }
    } catch (err) {
      console.error('[EventHubProducer] Error during disconnect:', err);
    }

    connectionInfoRef.current = null;
    setStatus('disconnected');
    setError(null);
    isConnectingRef.current = false;
  }, []);

  const connect = useCallback(
    async (connectionString: string) => {
      // Prevent multiple simultaneous connection attempts
      if (isConnectingRef.current) {
        console.log('[EventHubProducer] Connection already in progress, ignoring...');
        return;
      }

      // Validate connection string
      const validation = validateConnectionString(connectionString);
      if (!validation.valid) {
        setError(validation.error || 'Invalid connection string');
        setStatus('error');
        return;
      }

      const info = parseConnectionString(connectionString);
      if (!info) {
        setError('Failed to parse connection string');
        setStatus('error');
        return;
      }

      // Disconnect any existing connection
      await disconnect();

      isConnectingRef.current = true;
      setStatus('connecting');
      setError(null);

      try {
        console.log('[EventHubProducer] Connecting to:', info.fullyQualifiedNamespace);
        console.log('[EventHubProducer] Event Hub:', info.entityPath);

        // Generate SAS token
        const namespaceEndpoint = `https://${info.fullyQualifiedNamespace}`;
        const sasToken = await Authorization.createRuntimeSASToken(
          namespaceEndpoint,
          info.sharedAccessKeyName,
          info.sharedAccessKey,
          SAS_TOKEN_TTL_SECONDS
        );

        console.log('[EventHubProducer] SAS Token generated successfully');

        // Create credential from SAS token
        const credential = new AzureSASCredential(sasToken);

        // Create the producer client
        const client = new EventHubProducerClient(
          info.fullyQualifiedNamespace,
          info.entityPath,
          credential,
          {
            identifier: `HeartbeatProducer-${Date.now()}`,
          }
        );

        producerClientRef.current = client;
        connectionInfoRef.current = info;
        setStatus('connected');
        console.log('[EventHubProducer] Successfully connected');

      } catch (err) {
        console.error('[EventHubProducer] Connection error:', err);
        let errorMessage = 'Failed to connect to Event Hub';
        if (err instanceof Error) {
          errorMessage = err.message || err.name || String(err);
        }
        setError(errorMessage);
        setStatus('error');
        
        // Clean up on error
        if (producerClientRef.current) {
          try {
            await producerClientRef.current.close();
          } catch {
            // Ignore cleanup errors
          }
          producerClientRef.current = null;
        }
      } finally {
        isConnectingRef.current = false;
      }
    },
    [disconnect]
  );

  const sendHeartbeat = useCallback(async (producerName: string): Promise<boolean> => {
    if (!producerClientRef.current || status !== 'connected') {
      console.warn('[EventHubProducer] Cannot send heartbeat - not connected');
      return false;
    }

    const heartbeat: HeartbeatMessage = {
      ProducerName: producerName,
      Timestamp: new Date().toISOString(),
      Healthy: true,
    };

    try {
      // Create a batch and add the event
      const batch = await producerClientRef.current.createBatch();
      const added = batch.tryAdd({ body: heartbeat });
      
      if (!added) {
        console.error('[EventHubProducer] Failed to add event to batch');
        return false;
      }

      // Send the batch
      await producerClientRef.current.sendBatch(batch);
      
      setLastSentMessage(heartbeat);
      setMessagesSent(prev => prev + 1);
      console.log('[EventHubProducer] Sent heartbeat:', heartbeat);
      return true;

    } catch (err) {
      console.error('[EventHubProducer] Error sending heartbeat:', err);
      setError(err instanceof Error ? err.message : 'Failed to send heartbeat');
      return false;
    }
  }, [status]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    status,
    error,
    lastSentMessage,
    messagesSent,
    connect,
    disconnect,
    sendHeartbeat,
  };
}
