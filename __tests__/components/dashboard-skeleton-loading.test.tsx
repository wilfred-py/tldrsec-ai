import { render, screen, waitFor } from '@testing-library/react'
import { DashboardClient } from '@/components/dashboard/dashboard-client'
import '@testing-library/jest-dom'

// Mock the user hook
jest.mock('@clerk/nextjs', () => ({
  useUser: () => ({
    user: {
      id: 'test-user-id',
      emailAddresses: [{ emailAddress: 'test@example.com' }]
    }
  })
}))

// Mock fetch for API calls
global.fetch = jest.fn()

describe('Dashboard Skeleton Loading', () => {
  beforeEach(() => {
    jest.clearAllMocks()

    // Mock API calls - /api/user/tickers never resolves to keep loading state
    ;(global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/api/user/tickers')) {
        return new Promise(() => {}) // Never resolves to keep loading state
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([])
      })
    })
  })

  test('shows skeleton during loading state', async () => {
    render(<DashboardClient />)

    // Wait for component to mount and start loading
    await waitFor(() => {
      const skeletons = document.querySelectorAll('[data-slot="skeleton"]')
      expect(skeletons.length).toBeGreaterThan(0)
    })

    // Verify skeleton rows exist
    const skeletonRows = document.querySelectorAll('[data-slot="skeleton"]')
    expect(skeletonRows.length).toBeGreaterThanOrEqual(5)
  })

  test('skeleton matches actual table structure', async () => {
    render(<DashboardClient />)

    await waitFor(() => {
      // Desktop skeleton should have proper table structure
      const table = screen.getByRole('table')
      expect(table).toBeInTheDocument()

      // Should have multiple rows (header + skeleton rows)
      const rows = screen.getAllByRole('row')
      expect(rows.length).toBeGreaterThan(1)
    })
  })

  test('displays mobile skeleton on smaller screens', async () => {
    // Mock mobile viewport
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 500,
    })

    render(<DashboardClient />)

    await waitFor(() => {
      // Mobile skeleton should use card-based layout
      const skeletons = document.querySelectorAll('[data-slot="skeleton"]')
      expect(skeletons.length).toBeGreaterThan(0)
    })
  })

  test('skeleton disappears when data is provided via initialCompanies', () => {
    const companies = [
      {
        id: '1',
        symbol: 'AAPL',
        name: 'Apple Inc.',
        lastFiling: '—',
        summaryCount: 5,
        preferences: { tenK: true, tenQ: true, eightK: true, form4: true, other: false }
      }
    ]

    render(<DashboardClient initialCompanies={companies} />)

    // Should show real data, not skeleton (may appear in desktop + mobile views)
    const matches = screen.getAllByText('AAPL')
    expect(matches.length).toBeGreaterThan(0)

    // No skeletons should be visible
    const skeletons = document.querySelectorAll('[data-slot="skeleton"]')
    expect(skeletons).toHaveLength(0)
  })

  test('skeleton shows correct number of rows', async () => {
    render(<DashboardClient />)

    await waitFor(() => {
      // Should show 8 skeleton rows + 1 header = 9 total
      const rows = screen.getAllByRole('row')
      expect(rows).toHaveLength(9)
    })
  })

  test('skeleton maintains responsive behavior', async () => {
    render(<DashboardClient />)

    await waitFor(() => {
      // Desktop skeleton should be hidden on mobile
      const desktopSkeleton = document.querySelector('.hidden.sm\\:block')
      expect(desktopSkeleton).toBeInTheDocument()

      // Mobile skeleton should be hidden on desktop
      const mobileSkeleton = document.querySelector('.sm\\:hidden')
      expect(mobileSkeleton).toBeInTheDocument()
    })
  })
})
