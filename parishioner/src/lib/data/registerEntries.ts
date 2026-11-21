import * as mock from '../mock/registerEntries'
import * as api from '../api/registerEntries'
import { useApi } from './useApi'

export const fetchMyRegisterEntries = useApi ? api.fetchMyRegisterEntries : mock.fetchMyRegisterEntries
export const fetchRegisterEntryCertificateHtml = useApi ? api.fetchRegisterEntryCertificateHtml : mock.fetchRegisterEntryCertificateHtml
