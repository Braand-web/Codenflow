import type { SidebarBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { HeroBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-conversation/client'

/**
 * Render the Coden flow mark at the size supplied by its host surface.
 * @param props - Host-supplied mark presentation.
 * @returns the decorative flow mark.
 */
export function OfficialBrandMark({ size, ...props }: SidebarBrandMarkOwnerProps | HeroBrandMarkOwnerProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none"
      className={'className' in props ? props.className : undefined} aria-hidden="true">
      <path d="M22 7H13L5 16L13 25H22" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 16H27M23 12L27 16L23 20" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/**
 * Render the Coden flow product name.
 * @returns the branded name without its independently slotted mark.
 */
export function OfficialBrandName() {
  return <span style={{ whiteSpace: 'nowrap' }}>Coden flow</span>
}
