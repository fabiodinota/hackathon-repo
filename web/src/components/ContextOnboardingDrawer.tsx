import { Drawer } from 'vaul'
import { Eye, Sparkles } from 'lucide-react'

type Props = { container: HTMLElement; open: boolean; onEnable: () => void; onDecline: () => void }

export function ContextOnboardingDrawer({ container, open, onEnable, onDecline }: Props) {
  return <Drawer.Root container={container} open={open} onOpenChange={value => { if (!value) onDecline() }} noBodyStyles autoFocus>
    <Drawer.Portal container={container}>
      <Drawer.Overlay className="context-drawer-overlay" />
      <Drawer.Content className="context-drawer" aria-describedby="context-drawer-description">
        <Drawer.Handle className="drawer-handle" />
        <div className="drawer-icon"><Sparkles size={20} /></div>
        <p className="drawer-eyebrow">A more personal KBC</p>
        <Drawer.Title className="drawer-title">Enable context?</Drawer.Title>
        <Drawer.Description id="context-drawer-description" className="drawer-description">
          Allow local capture of this demo marketplace. Form values are hidden locally; OCR and Interdict filter the image before sanitized images and text go to the configured cloud AI. KBC receives the resulting intent summary.
        </Drawer.Description>
        <div className="drawer-example"><Eye size={17} /><span>You can change your choice anytime in the Context tab.</span></div>
        <div className="drawer-actions">
          <button className="drawer-primary" onClick={onEnable}>Yes, enable context</button>
          <button className="drawer-secondary" onClick={onDecline}>No, not now</button>
        </div>
      </Drawer.Content>
    </Drawer.Portal>
  </Drawer.Root>
}
