import { describe, it, expect } from 'vitest'
import { exportMyData, deleteAccount } from './account'
import { setCurrentUser } from './users'

describe('exportMyData', () => {
  it('resolves a real Blob built from the current mock user', async () => {
    setCurrentUser({ id: '1', fullName: 'Rio Galura', email: 'rio@example.com', phone: '', address: '' })

    const blob = await exportMyData()
    expect(blob).toBeInstanceOf(Blob)
    const text = await blob.text()
    const parsed = JSON.parse(text)
    expect(parsed.profile.email).toBe('rio@example.com')
  })
})

describe('deleteAccount', () => {
  it('rejects when the current password is wrong', async () => {
    await expect(deleteAccount('wrong-password')).rejects.toThrow('Current password is incorrect')
  })

  it('resolves and clears the current user when the password matches', async () => {
    setCurrentUser({ id: '1', fullName: 'Rio Galura', email: 'rio@example.com', phone: '', address: '' })
    await expect(deleteAccount('password123')).resolves.toBeUndefined()
    expect(localStorage.getItem('sakramentohub_mock_current_user')).toBeNull()
  })
})
