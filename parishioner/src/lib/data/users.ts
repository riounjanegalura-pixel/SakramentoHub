import * as mock from '../mock/users'
import * as api from '../api/users'
import { useApi } from './useApi'

export const fetchCurrentUser = useApi ? api.fetchCurrentUser : mock.fetchCurrentUser
export const updateCurrentUser = useApi ? api.updateCurrentUser : mock.updateCurrentUser
// setCurrentUser/clearCurrentUser are localStorage-only bookkeeping specific
// to the mock layer's session model — the real API has no equivalent (the
// bearer token IS the session, managed by lib/api/client.ts). Screens that
// called these directly are updated in this task to stop doing so outside
// mock mode; see ProfileScreen's mutationFn change below.
export const setCurrentUser = useApi ? () => {} : mock.setCurrentUser
export const clearCurrentUser = useApi ? () => {} : mock.clearCurrentUser
