import * as mock from '../mock/verify'
import * as api from '../api/verify'
import { useApi } from './useApi'

export const verifyCertificate = useApi ? api.verifyCertificate : mock.verifyCertificate
