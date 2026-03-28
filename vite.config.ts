import path from 'path';
import { defineConfig, loadEnv, Plugin } from 'vite';
import react from '@vitejs/plugin-react';

function geminiProxyPlugin(): Plugin {
  return {
    name: 'gemini-proxy',
    configureServer(server) {
      server.middlewares.use('/gemini-proxy', async (req, res) => {
        const targetBase = req.headers['x-proxy-target'] as string;
        if (!targetBase) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing x-proxy-target header' }));
          return;
        }

        const targetUrl = targetBase + req.url;
        const headers: Record<string, string> = {};
        for (const [key, value] of Object.entries(req.headers)) {
          if (key.startsWith('x-proxy-') || key === 'host' || key === 'connection') continue;
          if (value) headers[key] = Array.isArray(value) ? value[0] : value;
        }

        try {
          const chunks: Buffer[] = [];
          for await (const chunk of req) {
            chunks.push(Buffer.from(chunk));
          }
          const body = Buffer.concat(chunks);

          const resp = await fetch(targetUrl, {
            method: req.method || 'POST',
            headers,
            body: body.length > 0 ? body : undefined,
          });

          res.writeHead(resp.status, {
            'content-type': resp.headers.get('content-type') || 'application/json',
            'access-control-allow-origin': '*',
          });
          const buffer = Buffer.from(await resp.arrayBuffer());
          res.end(buffer);
        } catch (err: any) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react(), geminiProxyPlugin()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_BASE_URL': JSON.stringify(env.GEMINI_BASE_URL || '')
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
