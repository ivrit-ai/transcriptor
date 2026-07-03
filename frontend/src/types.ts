export type LineStatus = 'eligible' | 'full' | 'done_by_you' | 'flagged'

export interface BBox {
  x: number
  y: number
  w: number
  h: number
}

export interface SessionLine {
  id: string
  line_index: number
  bbox: BBox
  status: LineStatus
  transcription_count: number
  your_text?: string
  prior_text?: string  // backend field name for the user's prior submission text
  prior_kind?: string
}

export interface SessionDTO {
  page_id: string
  image_url: string
  width_px: number
  height_px: number
  image_rotation: number
  page_label?: string | number
  lines: SessionLine[]
}

export type FlagKind = 'cant_read' | 'bad_crop' | 'not_hebrew' | 'not_text' | 'other'
export type SubmitKind = 'text' | FlagKind

export interface LineStatusDTO {
  line_id: string
  status: LineStatus
  transcription_count: number
}

export interface PageDims {
  width_px: number
  height_px: number
}

// ── Admin DTOs ────────────────────────────────────────────────────────────────

export interface AdminStatsDTO {
  total_users: number
  active_today: number
  active_this_week: number
  total_transcriptions: number
  text_transcriptions: number
  overall_completion_pct: number
}

export type UserRole = 'user' | 'curator' | 'admin'

export interface AdminUserDTO {
  user_id: string
  display_name: string
  email: string
  role: UserRole
  joined_at: string | null
  last_active: string | null
  total_submissions: number
  text_count: number
  cant_read_count: number
  flag_count: number
}

export interface AdminCoverageDTO {
  batch_id: string
  external_id: string
  source: string
  total_pages: number
  total_lines: number
  lines_with_any: number
  lines_complete: number
  completion_pct: number
}

export interface AdminQueueDTO {
  total_lines: number
  lines_untouched: number
  lines_in_progress: number
  lines_complete: number
  pages_complete: number
  batches_complete: number
}

// ── Dataset (admin page browser) DTOs ────────────────────────────────────────

export interface AdminDatasetRowDTO {
  page_id: string
  page_external_id: string
  image_path: string
  approved: boolean
  approved_by: string | null
  rejected: boolean
  rejected_by: string | null
  updated_at: string | null
  batch_id: string
  batch_external_id: string
  source: string
}

export interface AdminDatasetDTO {
  items: AdminDatasetRowDTO[]
  page: number
  page_size: number
  total: number
  approved_count: number
  total_pages: number
}

export interface AdminPageLineDTO {
  id: string
  external_id?: string
  line_index: number
  bbox: BBox
  polygon?: unknown
  transcription_count: number
  detection_confidence?: number | null
}

export interface AdminPageLinesDTO {
  page_id: string
  external_id: string
  batch_external_id?: string
  document_name?: string
  image_url: string
  width_px: number
  height_px: number
  image_rotation: number
  approved: boolean
  rejected: boolean
  lines: AdminPageLineDTO[]
}

export interface UpdatePageLinesBody {
  rotation?: number
  lines?: Array<{
    external_id: string
    line_index: number
    bbox: BBox
    polygon?: unknown
    detection_confidence?: number | null
    transcription_count?: number
  }>
  approved?: boolean
  rejected?: boolean
}

export interface UpdatePageLinesResponse {
  page_id: string
  image_rotation: number
  approved: boolean
  rejected: boolean
  line_ids: string[] | null
}

// ── Import DTOs ───────────────────────────────────────────────────────────────

export type ImportMode = 'local-folder' | 'default-s3' | 'custom-s3'
export type ImportStatus = 'idle' | 'running' | 'completed' | 'failed'

export interface ImportStatusDTO {
  status: ImportStatus
  mode: ImportMode | null
  source: string | null
  license: string | null
  data_path: string | null
  clear_existing: boolean
  started_at: string | null
  finished_at: string | null
  exit_code: number | null
  default_s3_available: boolean
}

export interface ImportStartBody {
  mode: ImportMode
  source: string
  license: string
  data_path?: string | null
  clear_existing: boolean
  s3_key?: string | null
  s3_secret?: string | null
  s3_region?: string | null
}
