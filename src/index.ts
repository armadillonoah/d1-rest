import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { handleRest } from './rest';

export interface Env {
    DB?: D1Database;
    'verified-clean'?: D1Database;
    SECRET: string;
}

const app = new Hono<{ Bindings: Env }>();

app.use('*', cors());

// Middleware to use the correct database
app.use('*', async (c, next) => {
    // Use verified-clean if available, otherwise fall back to DB
    const db = c.env['verified-clean'] || c.env.DB;
    if (!db) {
        return c.json({ error: 'No database binding found' }, 500);
    }
    // Store the database reference for other handlers to use
    c.set('database', db);
    await next();
});

// Auth middleware for /rest and /query routes
app.use('/rest/*', async (c, next) => {
    if (c.req.header('Authorization') !== c.env.SECRET) {
        return c.json({ error: 'Unauthorized' }, 401);
    }
    await next();
});

app.use('/query', async (c, next) => {
    if (c.req.header('Authorization') !== c.env.SECRET) {
        return c.json({ error: 'Unauthorized' }, 401);
    }
    await next();
});

// Handle REST API endpoints
app.all('/rest/:table/:id?', handleRest);

// Handle raw SQL queries
app.post('/query', async (c) => {
    try {
        const body = await c.req.json();
        const { query, params } = body;

        if (!query) {
            return c.json({ error: 'No query provided' }, 400);
        }

        // Use the database from middleware
        const db = c.get('database') as D1Database;
        const results = await db.prepare(query)
            .bind(...(params || []))
            .all();

        return c.json(results);
    } catch (error) {
        return c.json({ error: (error as Error).message }, 400);
    }
});

export default app;