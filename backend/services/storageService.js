import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'yaml';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRootDir = path.resolve(__dirname, '..');

/**
 * Replace ${VAR_NAME} placeholders with process.env.VAR_NAME
 */
function replaceEnvVars(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/\$\{([^}]+)\}/g, (_, key) => process.env[key] || '');
}

/**
 * Process object recursively to replace environment variables
 */
function processConfigObj(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const result = Array.isArray(obj) ? [] : {};
  for (const [key, val] of Object.entries(obj)) {
    if (typeof val === 'string') {
      result[key] = replaceEnvVars(val);
    } else if (typeof val === 'object' && val !== null) {
      result[key] = processConfigObj(val);
    } else {
      result[key] = val;
    }
  }
  return result;
}

/**
 * Load and parse config.yaml
 */
export function getStorageConfig() {
  const configPath = process.env.CONFIG_YAML_PATH || path.join(backendRootDir, 'config.yaml');
  try {
    if (fs.existsSync(configPath)) {
      const fileContent = fs.readFileSync(configPath, 'utf8');
      const parsed = yaml.parse(fileContent);
      return processConfigObj(parsed?.storage || {});
    }
  } catch (err) {
    console.error(`[StorageService] Failed to read ${configPath}:`, err.message);
  }

  // Fallback default config if file is missing or unparseable
  return {
    provider: 'local',
    local: {
      upload_dir: 'uploads',
      public_path: '/uploads'
    }
  };
}

/**
 * Upload a file using the configured storage provider (local or s3)
 * @param {Object} file - Multer file object (buffer, originalname, mimetype)
 * @returns {Promise<string>} Public URL of uploaded image
 */
export async function uploadFile(file) {
  if (!file) {
    throw new Error('No file provided for upload.');
  }

  const storageConfig = getStorageConfig();
  const provider = (storageConfig.provider || 'local').toLowerCase();

  // Sanitize filename
  const timestamp = Date.now();
  const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
  const basename = path.basename(file.originalname, ext)
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .substring(0, 30);
  const filename = `${timestamp}_${basename}${ext}`;

  if (provider === 's3') {
    const s3Config = storageConfig.s3 || {};
    const bucket = s3Config.bucket || process.env.AWS_S3_BUCKET;
    const region = s3Config.region || process.env.AWS_REGION || 'us-east-1';
    const accessKeyId = s3Config.access_key_id || process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = s3Config.secret_access_key || process.env.AWS_SECRET_ACCESS_KEY;
    const endpoint = s3Config.endpoint || process.env.AWS_S3_ENDPOINT;

    if (!bucket) {
      throw new Error('S3 upload requested but bucket is not configured in config.yaml or AWS_S3_BUCKET.');
    }

    const clientConfig = {
      region,
      credentials: accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined
    };

    if (endpoint) {
      clientConfig.endpoint = endpoint;
      clientConfig.forcePathStyle = true;
    }

    const s3Client = new S3Client(clientConfig);
    const key = `inventory/${filename}`;

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype
    });

    await s3Client.send(command);

    if (endpoint) {
      return `${endpoint.replace(/\/$/, '')}/${bucket}/${key}`;
    }
    return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
  }

  // Local storage (default)
  const uploadDirRelative = storageConfig.local?.upload_dir || 'uploads';
  const targetDir = path.join(backendRootDir, uploadDirRelative, 'inventory');

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const filePath = path.join(targetDir, filename);
  fs.writeFileSync(filePath, file.buffer);

  const publicPathPrefix = storageConfig.local?.public_path || '/uploads';
  const cleanPublicPrefix = publicPathPrefix.endsWith('/') ? publicPathPrefix.slice(0, -1) : publicPathPrefix;
  return `${cleanPublicPrefix}/inventory/${filename}`;
}
