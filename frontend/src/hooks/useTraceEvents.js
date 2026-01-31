import { useState, useEffect, useRef } from 'react';

// Dynamic WebSocket URL based on current host
const getWsUrl = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const host = window.location.host;
    return `${protocol}://${host}/ws/trace`;
};

export const useTraceEvents = () => {
    const [events, setEvents] = useState([]);
    const [traces, setTraces] = useState([]);
    const [contextStats, setContextStats] = useState({
        token_usage: {
            total: 0,
            max: 16000,
            breakdown: { guiding: 0, informational: 0, actionable: 0 }
        },
        health: { healthy: true, issues: [] }
    });
    const [isConnected, setIsConnected] = useState(false);
    const wsRef = useRef(null);

    useEffect(() => {
        connect();
        return () => {
            if (wsRef.current) {
                wsRef.current.close();
            }
        };
    }, []);

    const connect = () => {
        try {
            const ws = new WebSocket(getWsUrl());
            wsRef.current = ws;

            ws.onopen = () => {
                console.log('Trace WebSocket Connected');
                setIsConnected(true);
            };

            ws.onclose = () => {
                console.log('Trace WebSocket Disconnected');
                setIsConnected(false);
                // 自动重连
                setTimeout(connect, 3000);
            };

            ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    handleMessage(message);
                } catch (e) {
                    console.error('Failed to parse WS message', e);
                }
            };
        } catch (e) {
            console.error('WebSocket connection error', e);
        }
    };

    const handleMessage = (message) => {
        const { type, payload } = message;

        if (type === 'trace_event') {
            setEvents(prev => [...prev, payload]);
        } else if (type === 'agent_trace_update') {
            setTraces(prev => {
                const index = prev.findIndex(t => t.agent_name === payload.agent_name);
                if (index >= 0) {
                    const newTraces = [...prev];
                    newTraces[index] = { ...newTraces[index], ...payload };
                    return newTraces;
                }
                return [...prev, payload];
            });
        } else if (type === 'context_stats_update') {
            setContextStats(payload);
        }
    };

    return { events, traces, contextStats, isConnected };
};
