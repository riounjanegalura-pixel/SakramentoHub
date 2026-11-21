import { describe, it, expect } from 'vitest'
import { changePassword } from './auth'

describe('changePassword', () => {
  it('rejects when the current password is wrong', async () => {
    await expect(changePassword('wrong-password', 'newpassword123')).rejects.toThrow(
      'Current password is incorrect',
    )
  })

  it('resolves when the current password matches the mock password', async () => {
    await expect(changePassword('password123', 'newpassword123')).resolves.toBeUndefined()
  })
})
