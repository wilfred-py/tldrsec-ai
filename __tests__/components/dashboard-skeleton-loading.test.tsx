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
    
    // Mock companies API to be pending initially
    ;(global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/api/companies')) {
        return new Promise(() => {}) // Never resolves to keep loading state
      }
      if (url.includes('/api/filings/summary')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([])
        })
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
      // Check for desktop skeleton elements
      const desktopSkeletons = document.querySelectorAll('[data-slot="skeleton"]')
      expect(desktopSkeletons.length).toBeGreaterThan(0)
    })

    // Verify table structure skeleton exists
    const tableHeaders = screen.getAllByRole('columnheader')
    expect(tableHeaders.length).toBeGreaterThan(0)

    // Verify skeleton rows exist
    const skeletonRows = document.querySelectorAll('[data-slot="skeleton"]')
    expect(skeletonRows.length).toBeGreaterThanOrEqual(5) // 5 skeleton rows minimum
  })

  test('skeleton matches actual table structure', async () => {
    render(<DashboardClient />)

    await waitFor(() => {
      // Desktop skeleton should have proper table structure
      const table = screen.getByRole('table')
      expect(table).toBeInTheDocument()

      // Should have header row
      const headerRow = screen.getByRole('row')
      expect(headerRow).toBeInTheDocument()

      // Should have multiple skeleton rows
      const rows = screen.getAllByRole('row')
      expect(rows.length).toBeGreaterThan(1) // Header + skeleton rows
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

  test('skeleton disappears when data loads', async () => {
    // Mock successful API response with delay
    ;(global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/api/companies')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            {
              ticker: 'AAPL',
              name: 'Apple Inc.',
              latestFilingDate: '2024-01-01',
              summaryCount: 5
            }
          ])
        })
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([])
      })
    })

    render(<DashboardClient />)

    // Initially should show skeleton
    await waitFor(() => {
      const skeletons = document.querySelectorAll('[data-slot="skeleton"]')
      expect(skeletons.length).toBeGreaterThan(0)
    })

    // After data loads, skeleton should be gone
    await waitFor(() => {
      const skeletons = document.querySelectorAll('[data-slot="skeleton"]')
      expect(skeletons.length).toBe(0)
    }, { timeout: 3000 })

    // Should show actual data
    await waitFor(() => {
      expect(screen.getByText('AAPL')).toBeInTheDocument()
      expect(screen.getByText('Apple Inc.')).toBeInTheDocument()
    })
  })

  test('skeleton shows correct number of rows', async () => {
    render(<DashboardClient />)

    await waitFor(() => {
      // Should show 5 skeleton rows as per the implementation
      const rows = screen.getAllByRole('row')
      // 1 header row + 5 skeleton rows = 6 total
      expect(rows.length).toBe(6)
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