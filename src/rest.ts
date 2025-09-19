import { Context } from 'hono';

const sanitizeIdentifier = (str: string): string => {
    return str.replace(/[^a-zA-Z0-9_]/g, '');
};

const sanitizeValue = (value: any): any => {
    if (typeof value === 'string') {
        // Basic SQL injection prevention - in production, use parameterized queries
        return value.replace(/'/g, "''");
    }
    return value;
};

export async function handleGet(c: Context) {
    const table = sanitizeIdentifier(c.req.param('table') || '');
    const id = c.req.param('id');

    // Get database from middleware
    const db = c.get('database') as D1Database;

    let query = `SELECT * FROM \`${table}\``;
    const params: any[] = [];

    if (id) {
        query += ` WHERE id = ?`;
        params.push(id);
    }

    // Handle query parameters for filtering
    const url = new URL(c.req.url);
    const filters: string[] = [];

    url.searchParams.forEach((value, key) => {
        if (key !== 'sort' && key !== 'limit' && key !== 'offset') {
            filters.push(`${sanitizeIdentifier(key)} = ?`);
            params.push(value);
        }
    });

    if (filters.length > 0 && !id) {
        query += ` WHERE ${filters.join(' AND ')}`;
    }

    // Handle sorting
    const sort = url.searchParams.get('sort');
    if (sort) {
        const [field, order] = sort.split(':');
        query += ` ORDER BY ${sanitizeIdentifier(field)} ${order === 'desc' ? 'DESC' : 'ASC'}`;
    }

    // Handle pagination
    const limit = url.searchParams.get('limit');
    const offset = url.searchParams.get('offset');
    if (limit) {
        query += ` LIMIT ${parseInt(limit)}`;
    }
    if (offset) {
        query += ` OFFSET ${parseInt(offset)}`;
    }

    try {
        const results = await db.prepare(query)
            .bind(...params)
            .all();

        return c.json(results);
    } catch (error) {
        return c.json({ error: (error as Error).message }, 400);
    }
}

export async function handlePost(c: Context) {
    const table = sanitizeIdentifier(c.req.param('table') || '');
    const data = await c.req.json();

    // Get database from middleware
    const db = c.get('database') as D1Database;

    if (Array.isArray(data)) {
        return c.json({ error: 'Batch insert not supported' }, 400);
    }

    const columns = Object.keys(data).map(sanitizeIdentifier);
    const placeholders = columns.map(() => '?').join(', ');
    const values = Object.values(data);

    const query = `INSERT INTO \`${table}\` (${columns.join(', ')}) VALUES (${placeholders})`;

    try {
        const result = await db.prepare(query)
            .bind(...values)
            .run();

        return c.json({
            success: result.success,
            meta: result.meta
        }, 201);
    } catch (error) {
        return c.json({ error: (error as Error).message }, 400);
    }
}

export async function handleUpdate(c: Context) {
    const table = sanitizeIdentifier(c.req.param('table') || '');
    const id = c.req.param('id');
    const data = await c.req.json();

    // Get database from middleware
    const db = c.get('database') as D1Database;

    if (!id) {
        return c.json({ error: 'ID required for update' }, 400);
    }

    const updates = Object.keys(data)
        .map(key => `${sanitizeIdentifier(key)} = ?`)
        .join(', ');

    const values = Object.values(data);
    values.push(id); // Add ID for WHERE clause

    const query = `UPDATE \`${table}\` SET ${updates} WHERE id = ?`;

    try {
        const result = await db.prepare(query)
            .bind(...values)
            .run();

        return c.json({
            success: result.success,
            meta: result.meta
        });
    } catch (error) {
        return c.json({ error: (error as Error).message }, 400);
    }
}

export async function handleDelete(c: Context) {
    const table = sanitizeIdentifier(c.req.param('table') || '');
    const id = c.req.param('id');

    // Get database from middleware
    const db = c.get('database') as D1Database;

    if (!id) {
        return c.json({ error: 'ID required for delete' }, 400);
    }

    const query = `DELETE FROM \`${table}\` WHERE id = ?`;

    try {
        const result = await db.prepare(query)
            .bind(id)
            .run();

        return c.json({
            success: result.success,
            meta: result.meta
        });
    } catch (error) {
        return c.json({ error: (error as Error).message }, 400);
    }
}

export async function handleRest(c: Context) {
    const method = c.req.method;

    switch (method) {
        case 'GET':
            return handleGet(c);
        case 'POST':
            return handlePost(c);
        case 'PUT':
        case 'PATCH':
            return handleUpdate(c);
        case 'DELETE':
            return handleDelete(c);
        default:
            return c.json({ error: 'Method not allowed' }, 405);
    }
}