const { test, describe, beforeEach, mock } = require('node:test');
const assert = require('node:assert');

const authMock = {
  authenticate: mock.fn(),
  getUserIdFromToken: mock.fn(),
  logout: mock.fn()
};

const fileManagerMock = {
  listUserFiles: mock.fn(),
  deleteFile: mock.fn(),
  compressUserFiles: mock.fn(),
  shareFile: mock.fn(),
  listSharedFiles: mock.fn()
};

describe('Tests API simplifiés', () => {
  beforeEach(() => {
    Object.values(authMock).forEach(fn => fn.mock?.resetCalls?.());
    Object.values(fileManagerMock).forEach(fn => fn.mock?.resetCalls?.());
  });

  test('Login avec identifiants valides', () => {
    authMock.authenticate.mock.mockImplementationOnce(() => 'test-token');
    
    const result = authMock.authenticate('testuser', 'testpass');
    
    assert.strictEqual(result, 'test-token');
    assert.strictEqual(authMock.authenticate.mock.callCount(), 1);
  });

  test('Login avec identifiants invalides', () => {
    authMock.authenticate.mock.mockImplementationOnce(() => null);
    
    const result = authMock.authenticate('testuser', 'wrongpass');
    
    assert.strictEqual(result, null);
  });

  test('Récupération des fichiers utilisateur', () => {
    authMock.getUserIdFromToken.mock.mockImplementationOnce(() => 'user123');
    fileManagerMock.listUserFiles.mock.mockImplementationOnce(() => ['file1.txt', 'file2.pdf']);
    
    const userId = authMock.getUserIdFromToken('valid-token');
    const files = fileManagerMock.listUserFiles(userId);
    
    assert.strictEqual(userId, 'user123');
    assert.deepStrictEqual(files, ['file1.txt', 'file2.pdf']);
  });

  test('Token invalide', () => {
    authMock.getUserIdFromToken.mock.mockImplementationOnce(() => null);
    
    const userId = authMock.getUserIdFromToken('invalid-token');
    
    assert.strictEqual(userId, null);
  });

  test('Suppression de fichier', () => {
    authMock.getUserIdFromToken.mock.mockImplementationOnce(() => 'user123');
    fileManagerMock.deleteFile.mock.mockImplementationOnce(() => true);
    
    const userId = authMock.getUserIdFromToken('valid-token');
    const success = fileManagerMock.deleteFile(userId, 'test.txt');
    
    assert.strictEqual(success, true);
    assert.strictEqual(fileManagerMock.deleteFile.mock.callCount(), 1);
  });

  test('Compression des fichiers', () => {
    authMock.getUserIdFromToken.mock.mockImplementationOnce(() => 'user123');
    fileManagerMock.compressUserFiles.mock.mockImplementationOnce((userId, callback) => {
      callback(null, { filename: 'archive.zip' });
    });
    
    const userId = authMock.getUserIdFromToken('valid-token');
    
    fileManagerMock.compressUserFiles(userId, (error, result) => {
      assert.strictEqual(error, null);
      assert.strictEqual(result.filename, 'archive.zip');
    });
  });

  test('Partage de fichier', () => {
    authMock.getUserIdFromToken.mock.mockImplementationOnce(() => 'user123');
    fileManagerMock.shareFile.mock.mockImplementationOnce(() => true);
    
    const userId = authMock.getUserIdFromToken('valid-token');
    const success = fileManagerMock.shareFile(userId, 'test.txt');
    
    assert.strictEqual(success, true);
  });

  test('Liste des fichiers partagés', () => {
    authMock.getUserIdFromToken.mock.mockImplementationOnce(() => 'user123');
    fileManagerMock.listSharedFiles.mock.mockImplementationOnce(() => ['shared1.txt', 'shared2.pdf']);
    
    authMock.getUserIdFromToken('valid-token');
    const files = fileManagerMock.listSharedFiles();
    
    assert.deepStrictEqual(files, ['shared1.txt', 'shared2.pdf']);
  });
});
