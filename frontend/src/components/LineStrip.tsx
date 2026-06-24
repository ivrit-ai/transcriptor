import { cropStyle } from '../utils/cropStyle'
import type { SessionLine, PageDims } from '../types'
import styles from './LineStrip.module.css'

interface LineStripProps {
  line: SessionLine
  pageDims: PageDims
  imageUrl: string
  role: 'previous' | 'active' | 'next'
  displayHeight?: number
}

const ACTIVE_HEIGHT = 100
const CONTEXT_HEIGHT = 48
const MAX_STRIP_WIDTH = 688   // content max-width (720) minus 2×16px padding

export function LineStrip({ line, pageDims, imageUrl, role, displayHeight }: LineStripProps) {
  const height = displayHeight ?? (role === 'active' ? ACTIVE_HEIGHT : CONTEXT_HEIGHT)
  const css = cropStyle(line.bbox, pageDims, height, 16, MAX_STRIP_WIDTH)

  const stripClass = [
    styles.strip,
    role === 'active' ? styles.stripActive : styles.stripContext,
  ].join(' ')

  return (
    <div className={stripClass}>
      <div
        className={styles.image}
        style={{
          ...css,
          backgroundImage: `url(${imageUrl})`,
        }}
        role="img"
        aria-label={`שורה ${line.line_index + 1}`}
      />
    </div>
  )
}
