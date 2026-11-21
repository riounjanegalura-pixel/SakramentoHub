import * as mock from '../mock/auth'
import * as api from '../api/auth'
import { useApi } from './useApi'

export const login = useApi ? api.login : mock.login
export const register = useApi ? api.register : mock.register
export const changePassword = useApi ? api.changePassword : mock.changePassword
// The mock layer has no server session to invalidate — logout there is a
// same-tick no-op object so every caller can await it uniformly.
export const logout = useApi ? api.logout : async () => {}
export const forgotPassword = useApi ? api.forgotPassword : mock.forgotPassword
export const resetPassword = useApi ? api.resetPassword : mock.resetPassword
export const resendVerificationEmail = useApi ? api.resendVerificationEmail : mock.resendVerificationEmail
export const verifyEmail = useApi ? api.verifyEmail : mock.verifyEmail
export const verifyEmailCode = useApi ? api.verifyEmailCode : mock.verifyEmailCode
export type { RegisterInput } from '../mock/auth'
