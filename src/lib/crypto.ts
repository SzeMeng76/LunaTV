import crypto from 'crypto';

/**
 * OpenSSL EVP_BytesToKey 密钥派生（MD5，与 crypto-js 密码模式兼容）
 * @param password 加密密码
 * @param salt 8 字节盐值
 * @param keyLen 密钥长度（AES-256 为 32）
 * @param ivLen IV 长度（CBC 为 16）
 */
function evpBytesToKey(
  password: string,
  salt: Buffer,
  keyLen: number,
  ivLen: number,
): { key: Buffer<ArrayBufferLike>; iv: Buffer<ArrayBufferLike> } {
  const md5 = (data: Buffer<ArrayBufferLike>) =>
    crypto.createHash('md5').update(data).digest();
  let derived: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  let prev: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  while (derived.length < keyLen + ivLen) {
    prev = md5(Buffer.concat([prev, Buffer.from(password, 'utf8'), salt]));
    derived = Buffer.concat([derived, prev]);
  }
  return {
    key: derived.subarray(0, keyLen),
    iv: derived.subarray(keyLen, keyLen + ivLen),
  };
}

/**
 * 简单的对称加密工具
 * 使用 AES-256-CBC 加密算法（OpenSSL "Salted__" 格式）
 */
export class SimpleCrypto {
  /**
   * 加密数据
   * @param data 要加密的数据
   * @param password 加密密码
   * @returns 加密后的字符串（Base64 编码）
   */
  static encrypt(data: string, password: string): string {
    try {
      const salt = crypto.randomBytes(8);
      const { key, iv } = evpBytesToKey(password, salt, 32, 16);
      const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
      const encrypted = Buffer.concat([
        cipher.update(data, 'utf8'),
        cipher.final(),
      ]);
      return Buffer.concat([Buffer.from('Salted__'), salt, encrypted]).toString(
        'base64',
      );
    } catch {
      throw new Error('加密失败');
    }
  }

  /**
   * 解密数据
   * @param encryptedData 加密的数据
   * @param password 解密密码
   * @returns 解密后的字符串
   */
  static decrypt(encryptedData: string, password: string): string {
    try {
      const raw = Buffer.from(encryptedData, 'base64');
      if (
        raw.length < 32 ||
        raw.subarray(0, 8).toString('utf8') !== 'Salted__'
      ) {
        throw new Error('解密失败，请检查密码是否正确');
      }
      const salt = raw.subarray(8, 16);
      const { key, iv } = evpBytesToKey(password, salt, 32, 16);
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
      const decrypted = Buffer.concat([
        decipher.update(raw.subarray(16)),
        decipher.final(),
      ]).toString('utf8');

      if (!decrypted) {
        throw new Error('解密失败，请检查密码是否正确');
      }

      return decrypted;
    } catch {
      throw new Error('解密失败，请检查密码是否正确');
    }
  }

  /**
   * 验证密码是否能正确解密数据
   * @param encryptedData 加密的数据
   * @param password 密码
   * @returns 是否能正确解密
   */
  static canDecrypt(encryptedData: string, password: string): boolean {
    try {
      const decrypted = this.decrypt(encryptedData, password);
      return decrypted.length > 0;
    } catch {
      return false;
    }
  }
}
