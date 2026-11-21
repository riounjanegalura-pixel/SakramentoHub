import * as mock from '../mock/parish'
import * as api from '../api/parish'
import { useApi } from './useApi'

export const fetchParishInfo = useApi ? api.fetchParishInfo : mock.fetchParishInfo
