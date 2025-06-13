const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');

const UPLOADS_DIR = path.join(__dirname, 'uploads');
const SHARED_DIR = path.join(__dirname, 'shared');

function initDirectories() {
  try {
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }
    if (!fs.existsSync(SHARED_DIR)) {
      fs.mkdirSync(SHARED_DIR, { recursive: true });
    }
    
    const users = JSON.parse(fs.readFileSync('users.json', 'utf-8'));
    users.forEach(user => {
      const userDir = path.join(UPLOADS_DIR, user.id);
      if (!fs.existsSync(userDir)) {
        fs.mkdirSync(userDir, { recursive: true });
      }
    });
    
    console.log('Dossiers initialisés');
  } catch (error) {
    console.error('Erreur initialisation dossiers:', error);
  }
}

function listUserFiles(userId) {
  try {
    const userDir = path.join(UPLOADS_DIR, userId);
    const files = fs.readdirSync(userDir).map(file => {
      const filePath = path.join(userDir, file);
      const stats = fs.statSync(filePath);
      return {
        name: file,
        size: stats.size,
        modified: stats.mtime,
        isDirectory: stats.isDirectory()
      };
    });
    return files;
  } catch (error) {
    console.error('Erreur listage fichiers:', error);
    return [];
  }
}

function saveFile(userId, filename, buffer) {
  try {
    const safeName = path.basename(filename);
    
    const timestamp = Date.now();
    const ext = path.extname(safeName);
    const uniqueName = `${timestamp}${ext}`;
    
    const filePath = path.join(UPLOADS_DIR, userId, uniqueName);
    const metaPath = path.join(UPLOADS_DIR, userId, 'metadata.json');
    
    fs.writeFileSync(filePath, buffer);
    

    let metadata = {};
    if (fs.existsSync(metaPath)) {
      metadata = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    }
    
    metadata[uniqueName] = {
      originalName: safeName,
      uploadDate: new Date().toISOString(),
      size: buffer.length
    };
    
    fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2));
    
    return { success: true, path: filePath, uniqueName };
  } catch (error) {
    console.error('Erreur sauvegarde fichier:', error);
    return { success: false, error: error.message };
  }
}


function getFile(userId, filename) {
  try {
    const safeName = path.basename(filename);
    const filePath = path.join(UPLOADS_DIR, userId, safeName);
    
    if (!fs.existsSync(filePath)) {
      return null;
    }
    
    return {
      buffer: fs.readFileSync(filePath),
      path: filePath,
      stats: fs.statSync(filePath)
    };
  } catch (error) {
    console.error('Erreur lecture fichier:', error);
    return null;
  }
}

function deleteFile(userId, filename) {
  try {
    const safeName = path.basename(filename);
    const filePath = path.join(UPLOADS_DIR, userId, safeName);
    
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Erreur suppression fichier:', error);
    return false;
  }
}

function compressUserFiles(userId, callback) {
  const userDir = path.join(UPLOADS_DIR, userId);
  const timestamp = Date.now();
  const zipName = `archive-${timestamp}.zip`;
  const zipPath = path.join(userDir, zipName);
  
  const zipProcess = spawn('zip', ['-r', zipName, '.', '-x', '*.zip'], {
    cwd: userDir
  });
  
  zipProcess.on('close', (code) => {
    if (code === 0) {
      callback(null, { filename: zipName, path: zipPath });
    } else {
      callback('Erreur lors de la compression', null);
    }
  });
  
  zipProcess.on('error', (error) => {
    const tarProcess = spawn('tar', ['-czf', `archive-${timestamp}.tar.gz`, '.'], {
      cwd: userDir
    });
    
    tarProcess.on('close', (code) => {
      const filename = `archive-${timestamp}.tar.gz`;
      if (code === 0) {
        callback(null, { filename, path: path.join(userDir, filename) });
      } else {
        callback('Erreur compression tar', null);
      }
    });
    
    tarProcess.on('error', () => {
      callback('Outils de compression non disponibles', null);
    });
  });
}

function getSharedFile(filename) {
    try {
        console.log(`Recherche du fichier partagé: ${filename}`);
        const files = fs.readdirSync(SHARED_DIR);
        console.log('Fichiers dans le dossier partagé:', files);
        
        const matchingFile = files.find(file => {
            if (file === filename) {
                return true;
            }
            
            const dashIndex = file.indexOf('-');
            if (dashIndex !== -1) {
                const storedFilename = file.substring(dashIndex + 1);
                return storedFilename === filename;
            }
            
            return false;
        });
        
        console.log('Fichier correspondant:', matchingFile);
        
        if (!matchingFile) {
            console.log(`Fichier partagé non trouvé: ${filename}`);
            return null;
        }

        const filePath = path.join(SHARED_DIR, matchingFile);
        console.log(`Fichier partagé trouvé: ${filePath}`);
        
        if (fs.existsSync(filePath)) {
            const stats = fs.statSync(filePath);
            const buffer = fs.readFileSync(filePath);
            return { buffer, stats };
        }

        return null;
    } catch (error) {
        console.error('Erreur getSharedFile:', error);
        return null;
    }
}

function analyzeFile(userId, filename, callback) {
  const safeName = path.basename(filename);
  const filePath = path.join(UPLOADS_DIR, userId, safeName);
  
  if (!fs.existsSync(filePath)) {
    return callback('Fichier non trouvé', null);
  }
  
  exec(`file "${filePath}"`, (error, stdout, stderr) => {
    if (error) {
      callback('Erreur analyse fichier', null);
    } else {
      const stats = fs.statSync(filePath);
      callback(null, {
        filename: safeName,
        type: stdout.trim(),
        size: stats.size,
        modified: stats.mtime
      });
    }
  });
}

function shareFile(userId, filename) {
  try {
    const safeName = path.basename(filename);
    const sourcePath = path.join(UPLOADS_DIR, userId, safeName);
    const sharedPath = path.join(SHARED_DIR, `${userId}-${safeName}`);
    
    console.log(`Partage de fichier: ${sourcePath} -> ${sharedPath}`);
    
    if (!fs.existsSync(sourcePath)) {
      console.log(`Fichier source non trouvé: ${sourcePath}`);
      return false;
    }
    
    fs.copyFileSync(sourcePath, sharedPath);
    console.log(`Fichier partagé avec succès: ${sharedPath}`);
    return true;
  } catch (error) {
    console.error('Erreur partage fichier:', error);
    return false;
  }
}

function listSharedFiles() {
  try {
    const files = fs.readdirSync(SHARED_DIR).map(file => {
      const filePath = path.join(SHARED_DIR, file);
      const stats = fs.statSync(filePath);
      const parts = file.split('-', 2);
      return {
        name: parts.length > 1 ? parts[1] : file,
        originalName: file,
        sharedBy: parts[0],
        size: stats.size,
        modified: stats.mtime
      };
    });
    return files;
  } catch (error) {
    console.error('Erreur listage fichiers partagés:', error);
    return [];
  }
}

module.exports = {
  initDirectories,
  listUserFiles,
  saveFile,
  getFile,
  getSharedFile,
  deleteFile,
  compressUserFiles,
  analyzeFile,
  shareFile,
  listSharedFiles
};