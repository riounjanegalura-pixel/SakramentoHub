import * as mock from '../mock/account'
import * as api from '../api/account'
import { useApi } from './useApi'

export const exportMyData = useApi ? api.exportMyData : mock.exportMyData
export const deleteAccount = useApi ? api.deleteAccount : mock.deleteAccount
