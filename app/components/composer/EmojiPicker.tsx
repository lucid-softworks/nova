import { useEffect, useRef, useState } from 'react'
import { Smile } from 'lucide-react'

const CATEGORIES: { label: string; emojis: string[] }[] = [
  {
    label: 'Smileys',
    emojis: [
      '😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩',
      '😘','😗','☺️','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔',
      '🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷',
    ],
  },
  {
    label: 'Gestures',
    emojis: [
      '👍','👎','👌','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','👇','☝️','✋','🤚','🖐️',
      '🖖','👋','🤝','🙏','💪','🙌','👏','🤲','👐',
    ],
  },
  {
    label: 'Hearts',
    emojis: ['❤️','🧡','💛','💚','💙','💜','🤎','🖤','🤍','💔','❣️','💕','💞','💓','💗','💖','💘','💝'],
  },
  {
    label: 'Objects',
    emojis: [
      '🎉','🎊','🎂','🎁','🔥','✨','⭐','🌟','💯','💡','📢','📣','📝','📌','📍','🔗',
      '🚀','💼','📈','📉','📊','💰','💸','🏆','🥇','🎯','⚡','☀️','🌙','☁️','🌈','🍀',
    ],
  },
]

export function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        title="Emoji"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-8 w-8 items-center justify-center rounded hover:bg-neutral-100 dark:hover:bg-neutral-800"
      >
        <Smile className="h-4 w-4" />
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-20 mt-1 w-72 rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-2 shadow-lg">
          <div className="max-h-64 overflow-y-auto">
            {CATEGORIES.map((cat) => (
              <div key={cat.label} className="mb-2">
                <div className="mb-1 text-[10px] font-semibold uppercase text-neutral-500 dark:text-neutral-400">
                  {cat.label}
                </div>
                <div className="grid grid-cols-8 gap-0.5">
                  {cat.emojis.map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => {
                        onPick(e)
                        setOpen(false)
                      }}
                      className="h-7 w-7 rounded text-lg leading-none hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
