import { useState, type ReactNode } from 'react'
import { CircleAlert } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs'

export interface SectionTab {
  id: string
  label: string
  content: ReactNode
  /** True while a field inside has a problem: the tab is marked and opens by itself so the field can take focus. */
  hasError?: boolean
}

/**
 * A long step split into tabs (panel: no one long scroll). Built on the shared Radix tabs. Every panel stays mounted
 * and only the active one is shown, so each field keeps its value and can still be found by validation.
 */
export function SectionTabs({ tabs, label }: { tabs: SectionTab[]; label: string }) {
  const [value, setValue] = useState(tabs[0].id)
  const failing = tabs.filter((t) => t.hasError).map((t) => t.id)
  const failingKey = failing.join('|')
  const [seenKey, setSeenKey] = useState(failingKey)

  // When a problem appears in a tab that is not showing, show that tab in the same render, before focus moves to it.
  if (failingKey !== seenKey) {
    setSeenKey(failingKey)
    if (failing.length > 0 && !failing.includes(value)) setValue(failing[0])
  }

  return (
    <Tabs value={value} onValueChange={setValue} className="mb-4">
      <TabsList variant="line" aria-label={label} className="w-full justify-start overflow-x-auto border-b border-line">
        {tabs.map((t) => (
          <TabsTrigger key={t.id} value={t.id} aria-label={t.hasError ? `${t.label}, has a problem` : undefined} className="min-h-11 flex-none px-3 text-base">
            {t.label}
            {t.hasError && <CircleAlert aria-hidden="true" className="text-danger" />}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((t) => (
        <TabsContent key={t.id} value={t.id} forceMount hidden={t.id !== value} className="pt-3">
          {t.content}
        </TabsContent>
      ))}
    </Tabs>
  )
}
