import * as mock from '../mock/availability'
import * as api from '../api/availability'
import { useApi } from './useApi'

export const fetchDayAvailability = useApi ? api.fetchDayAvailability : mock.fetchDayAvailability
export const fetchAvailabilityDays = useApi ? api.fetchAvailabilityDays : mock.fetchAvailabilityDays
