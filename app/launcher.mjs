#!/usr/bin/env node
// 塔防 Demo 桌面启动器（零依赖，只用 Node 标准库）
//
// 做的事：
//   1. 起一个只监听 127.0.0.1 的静态文件服务，端口随机（避免冲突）
//   2. 用 Chrome / Edge 的 --app 模式打开一个没有地址栏的应用窗口
//   3. 应用窗口关闭后自动关闭服务并退出
//
// 用法：
//   node app/launcher.mjs                 正常启动（打开应用窗口）
//   node app/launcher.mjs --no-open       只起服务，不开窗口（调试 / 自动化测试）
//   node app/launcher.mjs --port 8765     指定端口
//   node app/launcher.mjs --help

import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { readFile } from 'node:fs/promises';
import { existsSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

// 只对外提供游戏本体：仓库内部目录一律 404
const BLOCKED_DIRS = new Set(['.git', '.workbuddy', 'node_modules', 'tests', 'app', 'docs']);

/** 创建静态文件服务（导出以便自动化测试直接使用） */
export function createStaticServer(root = ROOT) {
  return http.createServer((req, res) => {
    const send = (status, text) => {
      res.writeHead(status, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(text);
    };
    const notFound = () => send(404, '404 Not Found');

    if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, '405 Method Not Allowed');

    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    } catch {
      return send(400, '400 Bad Request');
    }

    if (pathname === '/' || pathname === '') pathname = '/index.html';

    const target = path.resolve(root, `.${pathname}`);
    const relative = path.relative(root, target);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return notFound();

    const first = relative.split(path.sep)[0];
    if (first.startsWith('.') || BLOCKED_DIRS.has(first)) return notFound();

    readFile(target).then(
      (data) => {
        res.writeHead(200, {
          'Content-Type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream',
          'Content-Length': data.length,
          'Cache-Control': 'no-store',
        });
        if (req.method === 'HEAD') res.end();
        else res.end(data);
      },
      () => notFound()
    );
  });
}

/** 找一个基于 Chromium 的浏览器（支持 --app 无地址栏窗口） */
export function findChromiumBrowser() {
  const candidates = [];
  const { PROGRAMFILES, LOCALAPPDATA } = process.env;
  const pf86 = process.env['PROGRAMFILES(X86)'];

  if (process.platform === 'win32') {
    for (const base of [PROGRAMFILES, pf86, LOCALAPPDATA]) {
      if (!base) continue;
      candidates.push(path.join(base, 'Google', 'Chrome', 'Application', 'chrome.exe'));
      candidates.push(path.join(base, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
    }
  } else if (process.platform === 'darwin') {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Chromium.app/Contents/MacOS/Chromium'
    );
  } else {
    candidates.push(
      '/usr/bin/google-chrome',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/usr/bin/microsoft-edge'
    );
  }
  return candidates.find((file) => existsSync(file)) || null;
}

function parseArgs(argv) {
  const options = { port: 0, open: true, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--no-open') options.open = false;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--port') options.port = Number(argv[(i += 1)]);
    else if (arg.startsWith('--port=')) options.port = Number(arg.slice('--port='.length));
  }
  if (!Number.isInteger(options.port) || options.port < 0) options.port = 0;
  return options;
}

function usage() {
  console.log(`塔防 Demo 启动器

  node app/launcher.mjs               打开应用窗口
  node app/launcher.mjs --no-open     只启动本地服务
  node app/launcher.mjs --port 8765   指定端口
`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }

  const server = createStaticServer(ROOT);
  let browser = null;
  let profileDir = null;
  let closing = false;

  const cleanupProfile = () => {
    if (!profileDir) return;
    try {
      rmSync(profileDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 120 });
    } catch {
      // 浏览器可能仍占着锁，忽略即可（系统临时目录会自行清理）
    }
    profileDir = null;
  };

  const shutdown = (code = 0) => {
    if (closing) return;
    closing = true;
    try {
      server.close();
    } catch {
      /* 忽略 */
    }
    if (browser && !browser.killed) {
      try {
        browser.kill();
      } catch {
        /* 忽略 */
      }
    }
    cleanupProfile();
    process.exit(code);
  };

  server.on('error', (error) => {
    console.error(`启动失败：${error.message}`);
    process.exit(1);
  });

  server.listen(options.port, '127.0.0.1', () => {
    const port = server.address().port;
    const url = `http://127.0.0.1:${port}/index.html`;
    console.log(`塔防 Demo 已启动：${url}`);

    if (!options.open) {
      console.log('（--no-open：仅提供本地服务，按 Ctrl+C 退出）');
      return;
    }

    const executable = findChromiumBrowser();
    if (!executable) {
      console.log('未找到 Chrome / Edge，改用默认浏览器打开。关闭此窗口（Ctrl+C）结束服务。');
      const cmd =
        process.platform === 'win32'
          ? ['cmd', ['/c', 'start', '', url]]
          : process.platform === 'darwin'
            ? ['open', [url]]
            : ['xdg-open', [url]];
      spawn(cmd[0], cmd[1], { stdio: 'ignore', windowsHide: true });
      return;
    }

    // 独立的临时用户目录：应用窗口关闭时该浏览器进程会一起退出，便于回收服务
    profileDir = path.join(os.tmpdir(), `tower-defense-app-${process.pid}`);
    const launchedAt = Date.now();
    browser = spawn(
      executable,
      [
        `--app=${url}`,
        `--user-data-dir=${profileDir}`,
        '--window-size=820,660',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-features=TranslateUI',
      ],
      { stdio: 'ignore', windowsHide: false }
    );

    browser.on('error', (error) => {
      console.error(`无法启动浏览器：${error.message}`);
      shutdown(1);
    });

    browser.on('exit', () => {
      // 启动瞬间就退出说明它把窗口交给了已有进程，此时不要关服务
      if (Date.now() - launchedAt < 3000) {
        console.log('窗口已交给浏览器进程，服务继续运行，按 Ctrl+C 退出。');
        browser = null;
        return;
      }
      console.log('应用窗口已关闭，正在退出…');
      shutdown(0);
    });

    console.log('关闭应用窗口即可退出（或在此按 Ctrl+C）');
  });

  process.on('SIGINT', () => shutdown(0));
  process.on('SIGTERM', () => shutdown(0));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
