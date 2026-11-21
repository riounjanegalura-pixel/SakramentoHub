import * as mock from '../mock/events'
import * as api from '../api/events'
import { useApi } from './useApi'

export const fetchUpcomingEvents = useApi ? api.fetchUpcomingEvents : mock.fetchUpcomingEvents
