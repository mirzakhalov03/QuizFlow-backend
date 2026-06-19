import { expect } from 'chai'
import { describe, it, vi, beforeEach } from 'vitest'

import * as folderService from '../../src/services/folder.service'

const { dbMock } = vi.hoisted(() => {
  const mock = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockReturnThis(),
    transaction: vi.fn((cb) => cb(mock)),
  }
  return { dbMock: mock }
})

vi.mock('../../src/database/database', () => ({
  db: dbMock,
}))

describe('FolderService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbMock.select.mockReturnThis()
    dbMock.from.mockReturnThis()
    dbMock.where.mockReturnThis()
    dbMock.orderBy.mockReturnThis()
    dbMock.limit.mockReturnThis()
    dbMock.groupBy.mockReturnThis()
    dbMock.leftJoin.mockReturnThis()
    dbMock.update.mockReturnThis()
    dbMock.set.mockReturnThis()
    dbMock.delete.mockReturnThis()
    dbMock.insert.mockReturnThis()
    dbMock.values.mockReturnThis()
    dbMock.returning.mockReturnThis()
  })

  describe('getFolders', () => {
    it('should return a list of folders for a user', async () => {
      const mockFolders = [{ id: 'f-1', name: 'Folder 1', quizCount: 5 }]
      dbMock.orderBy.mockResolvedValueOnce(mockFolders)

      const result = await folderService.getFolders('user-1')
      expect(result).to.have.lengthOf(1)
      expect(result[0].name).to.equal('Folder 1')
    })
  })

  describe('createFolder', () => {
    it('should create a new folder and return it', async () => {
      const mockFolder = { id: 'f-1', name: 'New Folder' }
      dbMock.returning.mockResolvedValueOnce([mockFolder])

      const result = await folderService.createFolder('user-1', 'New Folder')
      expect(result.id).to.equal('f-1')
    })
  })

  describe('updateFolder', () => {
    it('should update folder name', async () => {
      const mockFolder = { id: 'f-1', name: 'Updated Name' }
      dbMock.returning.mockResolvedValueOnce([mockFolder])

      const result = await folderService.updateFolder('user-1', 'f-1', 'Updated Name')
      expect(result.name).to.equal('Updated Name')
    })
  })
})
