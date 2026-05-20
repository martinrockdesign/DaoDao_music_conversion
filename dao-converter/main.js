// ======================== 粒子背景初始化 (动态变色) ========================
let vantaEffect = null;
const techColors = [
    { c1: 0x00f2fe, c2: 0x4facfe },
    { c1: 0x7f00ff, c2: 0xff007f },
    { c1: 0x00ff87, c2: 0x60efff },
    { c1: 0xf43f5e, c2: 0xfca5a5 }
];

function initVanta() {
    if (vantaEffect) vantaEffect.destroy();
    try {
        vantaEffect = VANTA.DOTS({
            el: "#vanta-bg",
            mouseControls: true,
            touchControls: true,
            minHeight: 200,
            minWidth: 200,
            scale: 1.0,
            scaleMobile: 1.0,
            color: techColors[0].c1,
            color2: techColors[0].c2,
            backgroundColor: 0x060913,
            size: 2.80,
            spacing: 32.00
        });
        setInterval(() => {
            if (vantaEffect && vantaEffect.setOptions) {
                const randomPair = techColors[Math.floor(Math.random() * techColors.length)];
                vantaEffect.setOptions({
                    color: randomPair.c1,
                    color2: randomPair.c2
                });
            }
        }, 4000);
    } catch (e) {
        document.getElementById('vanta-bg').style.background = "#060913";
    }
}
window.addEventListener('load', () => {
    initVanta();
    window.addEventListener('resize', () => { if (vantaEffect) vantaEffect.resize(); });
});

// ======================== 音频转换核心 ========================
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const fileListContainer = document.getElementById('fileListContainer');
const convertBtn = document.getElementById('convertBtn');
const progressWrapper = document.getElementById('progressWrapper');
const progressFill = document.getElementById('progressFill');
const resultArea = document.getElementById('resultArea');
const statusSpan = document.getElementById('statusText');

let pendingFiles = [];
let ffmpeg = null;
let ffmpegReady = false;

function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function escapeHtml(str) {
    return str.replace(/[&<>]/g, function (m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

function renderFileList() {
    if (pendingFiles.length === 0) {
        fileListContainer.style.display = 'none';
        convertBtn.disabled = true;
        return;
    }
    fileListContainer.style.display = 'block';
    let html = '';
    pendingFiles.forEach((file, idx) => {
        const ext = file.name.split('.').pop().toUpperCase();
        html += `
            <div class="file-item">
                <span class="file-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
                <span class="file-size">${formatSize(file.size)} · ${ext}</span>
                <button class="remove-btn" data-index="${idx}">✕</button>
            </div>
        `;
    });
    fileListContainer.innerHTML = html;
    document.querySelectorAll('.remove-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = parseInt(btn.getAttribute('data-index'));
            if (!isNaN(idx)) {
                pendingFiles.splice(idx, 1);
                renderFileList();
                if (pendingFiles.length === 0) {
                    resultArea.style.display = 'none';
                    resultArea.innerHTML = '';
                }
                setStatusText('文件已移除', false);
            }
        });
    });
    convertBtn.disabled = false;
}

function addFiles(files) {
    let added = 0;
    for (let f of files) {
        const ext = f.name.split('.').pop().toLowerCase();
        if (['ogg', 'kgm', 'ncm'].includes(ext)) {
            if (!pendingFiles.some(ex => ex.name === f.name && ex.size === f.size)) {
                pendingFiles.push(f);
                added++;
            }
        } else {
            setStatusText(`跳过不支持格式: ${f.name}`, true);
        }
    }
    if (added) {
        renderFileList();
        resultArea.style.display = 'none';
        resultArea.innerHTML = '';
        setStatusText(`已载入 ${added} 个文件`, false);
    }
}

function setStatusText(msg, isError = false) {
    statusSpan.innerHTML = isError ? `<span class="error-msg">⚠️ ${escapeHtml(msg)}</span>` : escapeHtml(msg);
    if (isError) {
        setTimeout(() => {
            if (statusSpan.querySelector('.error-msg') && statusSpan.innerText.includes(msg)) {
                statusSpan.innerHTML = '内核就绪 · 稳定解析核心';
            }
        }, 4000);
    }
}

// ---------- FFmpeg 初始化 (使用 0.11.6 兼容 API) ----------
async function initFFmpeg() {
    if (ffmpegReady && ffmpeg) return ffmpeg;
    if (window._ffLoading) {
        while (!ffmpegReady && window._ffLoading) await new Promise(r => setTimeout(r, 150));
        return ffmpeg;
    }
    window._ffLoading = true;
    progressWrapper.style.display = 'block';
    setStatusText('⚙️ 加载转换引擎 (首次约12MB)...', false);
    try {
        if (typeof FFmpeg === 'undefined') throw new Error('FFmpeg 主库未加载，请刷新页面重试');
        // 使用 createFFmpeg 工厂函数 (0.11.x 风格)
        ffmpeg = FFmpeg.createFFmpeg({
            log: true,
            corePath: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js'
        });
        await ffmpeg.load();
        ffmpegReady = true;
        setStatusText('✅ 引擎就绪', false);
        progressWrapper.style.display = 'none';
        window._ffLoading = false;
        return ffmpeg;
    } catch (err) {
        console.error(err);
        setStatusText(`引擎加载失败: ${err.message}`, true);
        progressWrapper.style.display = 'none';
        window._ffLoading = false;
        throw err;
    }
}

// ---------- 解密模块 (NCM + KGM) ----------
async function ensureCryptoJS() {
    if (window.CryptoJS) return;
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.2.0/crypto-js.min.js";
        script.onload = resolve;
        script.onerror = () => reject(new Error('CryptoJS 加载失败'));
        document.head.appendChild(script);
    });
}

function rc4Crypt(data, keyBytes) {
    let s = [...Array(256).keys()];
    let j = 0;
    for (let i = 0; i < 256; i++) {
        j = (j + s[i] + keyBytes[i % keyBytes.length]) & 0xff;
        [s[i], s[j]] = [s[j], s[i]];
    }
    let i = 0, j2 = 0;
    const res = new Uint8Array(data.length);
    for (let idx = 0; idx < data.length; idx++) {
        i = (i + 1) & 0xff;
        j2 = (j2 + s[i]) & 0xff;
        [s[i], s[j2]] = [s[j2], s[i]];
        const k = s[(s[i] + s[j2]) & 0xff];
        res[idx] = data[idx] ^ k;
    }
    return res;
}

async function decryptNCM(buffer) {
    await ensureCryptoJS();
    const view = new DataView(buffer);
    let magic = '';
    for (let i = 0; i < 8; i++) magic += String.fromCharCode(view.getUint8(i));
    if (magic !== 'CTENCDNT') throw new Error('非合法 NCM 容器');
    let offset = 10;
    const metaSize = view.getUint32(offset, true); offset += 4;
    const encMeta = new Uint8Array(buffer, offset, metaSize); offset += metaSize;
    offset += 4; // CRC
    const imgSize = view.getUint32(offset, true); offset += 4;
    if (imgSize > 0) offset += imgSize;
    const encAudio = new Uint8Array(buffer, offset);
    const aesKey = CryptoJS.enc.Utf8.parse('neteasecloudmusic09');
    const encBase64 = CryptoJS.enc.Base64.stringify(CryptoJS.lib.WordArray.create(encMeta));
    let decMeta;
    try {
        const dec = CryptoJS.AES.decrypt(encBase64, aesKey, { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 });
        decMeta = dec.toString(CryptoJS.enc.Utf8);
    } catch (e) {
        throw new Error('元数据解密失败');
    }
    const metaJson = JSON.parse(decMeta);
    const keyData = metaJson.key;
    if (!keyData) throw new Error('未找到解密密钥');
    const rc4Raw = CryptoJS.enc.Base64.parse(keyData);
    const keyBytes = new Uint8Array(rc4Raw.words.length * 4);
    for (let i = 0; i < rc4Raw.words.length; i++) {
        const w = rc4Raw.words[i];
        keyBytes[i * 4] = (w >>> 24) & 0xff;
        keyBytes[i * 4 + 1] = (w >>> 16) & 0xff;
        keyBytes[i * 4 + 2] = (w >>> 8) & 0xff;
        keyBytes[i * 4 + 3] = w & 0xff;
    }
    let decAudio = rc4Crypt(encAudio, keyBytes);
    // 自动搜寻音频头 (ID3, Ogg, flac)
    for (let i = 0; i < Math.min(64, decAudio.length - 4); i++) {
        if ((decAudio[i] === 0x49 && decAudio[i + 1] === 0x44 && decAudio[i + 2] === 0x33) ||
            (decAudio[i] === 0x4F && decAudio[i + 1] === 0x67) ||
            (decAudio[i] === 0x66 && decAudio[i + 1] === 0x4C)) {
            return decAudio.slice(i).buffer;
        }
    }
    return decAudio.buffer;
}

async function decryptKGM(buffer) {
    const data = new Uint8Array(buffer);
    const tryMask = (mask) => {
        const out = new Uint8Array(data.length);
        for (let i = 0; i < data.length; i++) out[i] = data[i] ^ mask;
        return out;
    };
    let dec = tryMask(0x7d);
    if ((dec[0] === 0x4F && dec[1] === 0x67) || (dec[0] === 0x49 && dec[1] === 0x44)) return dec.buffer;
    dec = tryMask(0x7c);
    if ((dec[0] === 0x4F && dec[1] === 0x67) || (dec[0] === 0x49 && dec[1] === 0x44)) return dec.buffer;
    return tryMask(0x7d).buffer;
}

// 单文件转换 (使用 0.11.x 的 FS API)
async function convertOne(file, ff, progressCb) {
    const ext = file.name.split('.').pop().toLowerCase();
    let rawBuffer;
    const baseName = file.name.replace(/\.(ogg|kgm|ncm)$/i, '');
    const fileBuf = await file.arrayBuffer();

    if (ext === 'ogg') rawBuffer = fileBuf;
    else if (ext === 'ncm') rawBuffer = await decryptNCM(fileBuf);
    else rawBuffer = await decryptKGM(fileBuf);

    progressCb(0.3);
    const inFile = `in_${Date.now()}_${Math.random()}.bin`;
    const outFile = `${baseName}.mp3`;

    ff.FS('writeFile', inFile, new Uint8Array(rawBuffer));
    await ff.run('-i', inFile, '-acodec', 'libmp3lame', '-ab', '192k', '-ar', '44100', '-y', outFile);
    progressCb(0.85);
    const outData = ff.FS('readFile', outFile);
    ff.FS('unlink', inFile);
    ff.FS('unlink', outFile);
    return { blob: new Blob([outData], { type: 'audio/mpeg' }), filename: outFile };
}

// 批量转换
async function startConversion() {
    if (pendingFiles.length === 0) return;
    if (!ffmpegReady) {
        progressWrapper.style.display = 'block';
        setStatusText('初始化引擎...', false);
        try {
            await initFFmpeg();
        } catch (e) {
            setStatusText(`引擎错误: ${e.message}`, true);
            progressWrapper.style.display = 'none';
            return;
        }
    }
    convertBtn.disabled = true;
    progressWrapper.style.display = 'block';
    resultArea.style.display = 'none';
    resultArea.innerHTML = '';
    const total = pendingFiles.length;
    let successList = [];

    for (let i = 0; i < total; i++) {
        const file = pendingFiles[i];
        setStatusText(`解析转换中 (${i + 1}/${total}): ${file.name}`, false);
        progressFill.style.width = `${(i / total) * 100}%`;
        try {
            const res = await convertOne(file, ffmpeg, (p) => {
                const percent = ((i + p) / total) * 100;
                progressFill.style.width = `${Math.min(percent, 99)}%`;
            });
            successList.push(res);
            progressFill.style.width = `${((i + 1) / total) * 100}%`;
        } catch (err) {
            console.error(err);
            setStatusText(`失败: ${file.name} - ${err.message}`, true);
            await new Promise(r => setTimeout(r, 300));
        }
    }
    progressFill.style.width = '100%';
    setTimeout(() => {
        progressWrapper.style.display = 'none';
    }, 500);

    if (successList.length) {
        setStatusText(`✅ 转换完成! 成功 ${successList.length}/${total}`, false);
        resultArea.style.display = 'grid';
        for (const r of successList) {
            const url = URL.createObjectURL(r.blob);
            const a = document.createElement('a');
            a.className = 'download-link';
            a.href = url;
            a.download = r.filename;
            a.innerHTML = `<span>${escapeHtml(r.filename)}</span><span style="font-size:0.7rem; font-weight:bold;">DOWNLOAD</span>`;
            resultArea.appendChild(a);
        }
        // 清空文件列表，允许新一轮转换
        pendingFiles = [];
        renderFileList();
    } else {
        setStatusText('当前音频流密钥不匹配，无解密输出', true);
    }
    convertBtn.disabled = false;
}

// 绑定事件
dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files.length) addFiles(Array.from(e.dataTransfer.files));
});
fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) addFiles(Array.from(e.target.files));
    fileInput.value = '';
});
convertBtn.addEventListener('click', startConversion);

// 预加载引擎
window.addEventListener('load', () => {
    if (window.location.protocol !== 'file:') {
        setTimeout(() => initFFmpeg().catch(e => console.warn("预加载失败", e)), 800);
    } else {
        setStatusText('⚠️ 请通过 http:// 访问本页面 (本地服务器)', true);
    }
});