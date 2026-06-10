import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = __dirname;
const frontendDir = path.join(rootDir, 'frontend');
const tempDistDir = path.join(frontendDir, 'temp-dist');
const backendTargetDir = path.join(frontendDir, 'backend');
const workpathDir = path.join(rootDir, 'build-backend');

function runCommand(cmd, cwd) {
  console.log(`Running: ${cmd} in ${cwd || 'root'}`);
  execSync(cmd, { cwd, stdio: 'inherit' });
}

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();
  if (isDirectory) {
    fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursiveSync(
        path.join(src, childItemName),
        path.join(dest, childItemName)
      );
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

async function main() {
  try {
    // 1. Build Vite frontend
    console.log('--- 1. Building Vite Frontend ---');
    runCommand('npm run build', frontendDir);

    // 2. Build Python Backend using PyInstaller
    console.log('--- 2. Building Python Backend via PyInstaller ---');
    if (fs.existsSync(tempDistDir)) fs.rmSync(tempDistDir, { recursive: true, force: true });
    if (fs.existsSync(workpathDir)) fs.rmSync(workpathDir, { recursive: true, force: true });
    const specFile = path.join(rootDir, 'renda-backend.spec');
    if (fs.existsSync(specFile)) fs.rmSync(specFile, { force: true });
    
    runCommand(
      `python -m PyInstaller --noconfirm --clean --onedir --name renda-backend --collect-data babelfish --collect-data guessit --collect-submodules babelfish --collect-submodules guessit --distpath "${tempDistDir}" --workpath "${workpathDir}" app/api/main.py`,
      rootDir
    );

    // 3. Setup backend files under frontend/backend
    console.log('--- 3. Structuring backend folder ---');
    if (fs.existsSync(backendTargetDir)) fs.rmSync(backendTargetDir, { recursive: true, force: true });
    fs.mkdirSync(backendTargetDir, { recursive: true });

    const generatedBackend = path.join(tempDistDir, 'renda-backend');
    copyRecursiveSync(generatedBackend, backendTargetDir);

    // 4. Bundle FFmpeg & FFprobe
    console.log('--- 4. Bundling FFmpeg and FFprobe ---');
    const binDir = path.join(backendTargetDir, 'bin');
    fs.mkdirSync(binDir, { recursive: true });

    const isWin = process.platform === 'win32';
    const ffmpegBinName = isWin ? 'ffmpeg.exe' : 'ffmpeg';
    const ffprobeBinName = isWin ? 'ffprobe.exe' : 'ffprobe';

    // Look for ffmpeg and ffprobe on system path
    let ffmpegPath = isWin ? 'C:\\ffmpeg\\bin\\ffmpeg.exe' : '';
    let ffprobePath = isWin ? 'C:\\ffmpeg\\bin\\ffprobe.exe' : '';

    if (!ffmpegPath || !fs.existsSync(ffmpegPath) || !ffprobePath || !fs.existsSync(ffprobePath)) {
      try {
        const searchCmd = isWin ? 'where' : 'which';
        const ffmpegOutput = execSync(`${searchCmd} ffmpeg`, { encoding: 'utf8' }).trim();
        const ffprobeOutput = execSync(`${searchCmd} ffprobe`, { encoding: 'utf8' }).trim();
        
        const whereFfmpeg = isWin ? ffmpegOutput.split('\r\n')[0] : ffmpegOutput.split('\n')[0];
        const whereFfprobe = isWin ? ffprobeOutput.split('\r\n')[0] : ffprobeOutput.split('\n')[0];
        
        if (fs.existsSync(whereFfmpeg)) ffmpegPath = whereFfmpeg;
        if (fs.existsSync(whereFfprobe)) ffprobePath = whereFfprobe;
      } catch (e) {
        console.warn('Could not find ffmpeg/ffprobe using system search command.');
      }
    }

    if (ffmpegPath && fs.existsSync(ffmpegPath)) {
      console.log(`Copying FFmpeg from ${ffmpegPath}`);
      fs.copyFileSync(ffmpegPath, path.join(binDir, ffmpegBinName));
    } else {
      console.error(`CRITICAL: ${ffmpegBinName} was not found. Please install ffmpeg.`);
    }

    if (ffprobePath && fs.existsSync(ffprobePath)) {
      console.log(`Copying FFprobe from ${ffprobePath}`);
      fs.copyFileSync(ffprobePath, path.join(binDir, ffprobeBinName));
    } else {
      console.error(`CRITICAL: ${ffprobeBinName} was not found. Please install ffprobe.`);
    }

    // 4.5 Copy icon.ico to standard builder locations
    console.log('--- 4.5 Copying application icon ---');
    const sourceIcon = path.join(frontendDir, 'public', 'favicon', 'icon.ico');
    if (fs.existsSync(sourceIcon)) {
      const buildDir = path.join(frontendDir, 'build');
      fs.mkdirSync(buildDir, { recursive: true });
      fs.copyFileSync(sourceIcon, path.join(buildDir, 'icon.ico'));
      fs.copyFileSync(sourceIcon, path.join(frontendDir, 'icon.ico'));
    } else {
      console.warn('Warning: icon.ico was not found in public/favicon');
    }

    // 5. Run electron-builder package
    console.log('--- 5. Packaging Electron Application ---');
    runCommand('npm run dist', frontendDir);

    // 6. Clean up temporary directories
    console.log('--- 6. Cleanup ---');
    if (fs.existsSync(tempDistDir)) fs.rmSync(tempDistDir, { recursive: true, force: true });
    if (fs.existsSync(workpathDir)) fs.rmSync(workpathDir, { recursive: true, force: true });

    console.log('\n=======================================');
    console.log('Build completed successfully!');
    console.log('Stand-alone packaged files are located in: frontend/dist-electron/');
    console.log('=======================================');
  } catch (error) {
    console.error('Build failed with error:', error);
    process.exit(1);
  }
}

main();
