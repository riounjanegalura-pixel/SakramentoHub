import { createContext } from 'react'

/** True inside a desktop page that already supplies the website frame (the Settings pane); screens there render only their content. */
export const WebPaneContext = createContext(false)
