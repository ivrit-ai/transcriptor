import { useState, useMemo } from 'react'
import { useMutation } from '@tanstack/react-query'
import { queryKeys, queryClient } from '../queries'
import type { AdminUserDTO, UserRole } from '../types'
import { api } from '../api'
import css from './AdminScreen.module.css'

type SortDir = 'asc' | 'desc'

const ROLES: UserRole[] = ['user', 'curator', 'admin']

const fmt = (n: number) => new Intl.NumberFormat('en-US').format(n)
const dateStr = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : '—'

function SortTh({
  col,
  label,
  sort,
  dir,
  onSort,
}: {
  col: string
  label: string
  sort: string
  dir: SortDir
  onSort: (c: string) => void
}) {
  const active = sort === col
  return (
    <th className={css.sortable} onClick={() => onSort(col)}>
      {label} {active ? (dir === 'desc' ? '↓' : '↑') : ''}
    </th>
  )
}

export function UsersTab({ users }: { users: AdminUserDTO[] }) {
  const [sort, setSort] = useState('text_count')
  const [dir, setDir] = useState<SortDir>('desc')

  const [roleOverrides, setRoleOverrides] = useState<Record<string, UserRole>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  const updateRoleMutation = useMutation({
    mutationFn: (params: { userId: string; role: UserRole }) =>
      api.updateUserRole(params.userId, params.role),
  })

  const sorted = useMemo(() => {
    const key = sort as keyof AdminUserDTO
    return [...users].sort((a, b) => {
      const av = a[key] ?? ''
      const bv = b[key] ?? ''
      const cmp = av < bv ? -1 : av > bv ? 1 : 0
      return dir === 'desc' ? -cmp : cmp
    })
  }, [users, sort, dir])

  const onSort = (col: string) => {
    if (sort === col) setDir(d => (d === 'desc' ? 'asc' : 'desc'))
    else {
      setSort(col)
      setDir('desc')
    }
  }

  const handleRoleChange = (userId: string, newRole: UserRole) => {
    setRoleOverrides(prev => ({ ...prev, [userId]: newRole }))
    setErrors(prev => { const next = { ...prev }; delete next[userId]; return next })
  }

  const handleRoleBlur = async (userId: string, originalRole: UserRole) => {
    const pending = roleOverrides[userId]
    if (pending === undefined || pending === originalRole) return

    setSaving(prev => ({ ...prev, [userId]: true }))
    setErrors(prev => { const next = { ...prev }; delete next[userId]; return next })

    updateRoleMutation.mutate(
      { userId, role: pending },
      {
        onSuccess: () => {
          setRoleOverrides(prev => { const next = { ...prev }; delete next[userId]; return next })
          queryClient.invalidateQueries({ queryKey: queryKeys.admin.users })
        },
        onError: () => {
          setErrors(prev => ({ ...prev, [userId]: 'Save failed' }))
        },
        onSettled: () => {
          setSaving(prev => { const next = { ...prev }; delete next[userId]; return next })
        },
      }
    )
  }

  return (
    <div className={css.tableWrap}>
      <table className={css.table}>
        <thead>
          <tr>
            <SortTh col="display_name" label="Name" sort={sort} dir={dir} onSort={onSort} />
            <th>Email</th>
            <SortTh col="role" label="Role" sort={sort} dir={dir} onSort={onSort} />
            <SortTh col="text_count" label="Text ↓" sort={sort} dir={dir} onSort={onSort} />
            <SortTh col="total_submissions" label="Total" sort={sort} dir={dir} onSort={onSort} />
            <SortTh col="cant_read_count" label="Can't read" sort={sort} dir={dir} onSort={onSort} />
            <SortTh col="flag_count" label="Flags" sort={sort} dir={dir} onSort={onSort} />
            <SortTh col="joined_at" label="Joined" sort={sort} dir={dir} onSort={onSort} />
            <SortTh col="last_active" label="Last active" sort={sort} dir={dir} onSort={onSort} />
          </tr>
        </thead>
        <tbody>
          {sorted.map(u => {
            const currentRole = roleOverrides[u.user_id] ?? u.role
            const isSaving = saving[u.user_id] ?? false
            const error = errors[u.user_id]
            return (
              <tr key={u.user_id}>
                <td style={{ fontWeight: 500 }}>{u.display_name}</td>
                <td className={css.muted}>{u.email}</td>
                <td>
                  <select
                    value={currentRole}
                    disabled={isSaving}
                    onChange={e => handleRoleChange(u.user_id, e.target.value as UserRole)}
                    onBlur={() => handleRoleBlur(u.user_id, u.role)}
                    title={error}
                    style={{
                      fontSize: 12,
                      fontFamily: 'var(--font-ui)',
                      padding: '2px 6px',
                      borderRadius: 5,
                      border: error
                        ? '1px solid oklch(0.55 0.18 25)'
                        : '0.5px solid var(--tl-border)',
                      background: isSaving ? 'var(--tl-muted-fill)' : 'var(--tl-surface)',
                      color: 'var(--tl-ink)',
                      cursor: isSaving ? 'wait' : 'pointer',
                      outline: 'none',
                    }}
                  >
                    {ROLES.map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                  {error && (
                    <span style={{ marginLeft: 6, fontSize: 11, color: 'oklch(0.55 0.18 25)' }}>
                      {error}
                    </span>
                  )}
                </td>
                <td style={{ fontWeight: 600, color: 'oklch(0.58 0.1 150)' }}>{fmt(u.text_count)}</td>
                <td>{fmt(u.total_submissions)}</td>
                <td className={css.muted}>{fmt(u.cant_read_count)}</td>
                <td className={css.muted}>{fmt(u.flag_count)}</td>
                <td className={css.muted}>{dateStr(u.joined_at)}</td>
                <td className={css.muted}>{dateStr(u.last_active)}</td>
              </tr>
            )
          })}
          {sorted.length === 0 && (
            <tr>
              <td
                colSpan={9}
                style={{ textAlign: 'center', color: 'var(--tl-muted)', padding: 32 }}
              >
                No users yet
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
