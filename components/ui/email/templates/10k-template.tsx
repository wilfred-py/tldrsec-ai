export default function Form10KEmailTemplate() {
  return (
    <div style={{ maxWidth: &quot;600px&quot;, margin: &quot;0 auto&quot;, fontFamily: &quot;Arial, sans-serif&quot;, backgroundColor: &quot;#f8fafc&quot; }}>
      {/* Header with gradient background */}
      <table
        width=&quot;100%&quot;
        cellPadding=&quot;0&quot;
        cellSpacing=&quot;0&quot;
        style={{
          background: &quot;linear-gradient(135deg, #7C3AED 0%, #EC4899 100%)&quot;,
          color: &quot;white&quot;,
          borderRadius: &quot;12px 12px 0 0&quot;,
        }}
      >
        <tbody>
          <tr>
            <td style={{ padding: &quot;24px&quot;, textAlign: &quot;center&quot; }}>
              <h1 style={{ margin: &quot;0&quot;, fontSize: &quot;32px&quot;, fontWeight: &quot;bold&quot;, letterSpacing: &quot;-0.5px&quot; }}>
                SEC Filing Summaries
              </h1>
              <p style={{ margin: &quot;12px 0 0&quot;, fontSize: &quot;18px&quot;, opacity: &quot;0.9&quot; }}>6/6/2025</p>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Filing Information */}
      <table
        width=&quot;100%&quot;
        cellPadding=&quot;0&quot;
        cellSpacing=&quot;0&quot;
        style={{ backgroundColor: &quot;white&quot;, border: &quot;1px solid #e2e8f0&quot;, borderTop: &quot;none&quot; }}
      >
        <tbody>
          <tr>
            <td style={{ padding: &quot;24px&quot; }}>
              <table width=&quot;100%&quot; cellPadding=&quot;0&quot; cellSpacing=&quot;0&quot;>
                <tbody>
                  <tr>
                    <td>
                      <h2
                        style={{
                          margin: &quot;0&quot;,
                          background: &quot;linear-gradient(135deg, #7C3AED 0%, #EC4899 100%)&quot;,
                          WebkitBackgroundClip: &quot;text&quot;,
                          WebkitTextFillColor: &quot;transparent&quot;,
                          backgroundClip: &quot;text&quot;,
                          fontSize: &quot;24px&quot;,
                          fontWeight: &quot;bold&quot;,
                        }}
                      >
                        Apple Inc. (AAPL) - Form 10-K Filing
                      </h2>
                      <p style={{ margin: &quot;8px 0 20px&quot;, color: &quot;#64748b&quot;, fontSize: &quot;14px&quot; }}>Filed on: 6/4/2025</p>
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Summary Box */}
              <table
                width=&quot;100%&quot;
                cellPadding=&quot;0&quot;
                cellSpacing=&quot;0&quot;
                style={{
                  backgroundColor: &quot;#fafafa&quot;,
                  border: &quot;1px solid #e2e8f0&quot;,
                  borderRadius: &quot;8px&quot;,
                  marginBottom: &quot;20px&quot;,
                  boxShadow: &quot;0 2px 4px rgba(0,0,0,0.05), 0 0 1px rgba(0,0,0,0.1)&quot;,
                  backgroundImage: &quot;linear-gradient(to bottom, #ffffff, #f9fafb)&quot;,
                }}
              >
                <tbody>
                  <tr>
                    <td style={{ padding: &quot;20px&quot; }}>
                      <h3
                        style={{
                          margin: &quot;0 0 16px&quot;,
                          color: &quot;#000000&quot;,
                          fontSize: &quot;18px&quot;,
                          fontWeight: &quot;bold&quot;,
                          borderBottom: &quot;2px solid #f1f5f9&quot;,
                          paddingBottom: &quot;8px&quot;,
                        }}
                      >
                        📋 Summary
                      </h3>

                      <table width=&quot;100%&quot; cellPadding=&quot;0&quot; cellSpacing=&quot;0&quot; style={{ borderCollapse: &quot;collapse&quot; }}>
                        <tbody>
                          <tr>
                            <td style={{ padding: &quot;8px 0&quot;, width: &quot;120px&quot;, verticalAlign: &quot;top&quot; }}>
                              <p style={{ margin: &quot;0&quot;, color: &quot;#6B7280&quot;, fontSize: &quot;14px&quot;, fontWeight: &quot;500&quot; }}>
                                Company:
                              </p>
                            </td>
                            <td style={{ padding: &quot;8px 0&quot;, verticalAlign: &quot;top&quot; }}>
                              <p style={{ margin: &quot;0&quot;, color: &quot;#374151&quot;, fontSize: &quot;14px&quot;, fontWeight: &quot;600&quot; }}>
                                Apple Inc.
                              </p>
                            </td>
                          </tr>
                          <tr>
                            <td style={{ padding: &quot;8px 0&quot;, width: &quot;120px&quot;, verticalAlign: &quot;top&quot; }}>
                              <p style={{ margin: &quot;0&quot;, color: &quot;#6B7280&quot;, fontSize: &quot;14px&quot;, fontWeight: &quot;500&quot; }}>
                                Form Type:
                              </p>
                            </td>
                            <td style={{ padding: &quot;8px 0&quot;, verticalAlign: &quot;top&quot; }}>
                              <p style={{ margin: &quot;0&quot;, color: &quot;#374151&quot;, fontSize: &quot;14px&quot; }}>
                                Form 10-K (Annual Report)
                              </p>
                            </td>
                          </tr>
                          <tr>
                            <td style={{ padding: &quot;8px 0&quot;, width: &quot;120px&quot;, verticalAlign: &quot;top&quot; }}>
                              <p style={{ margin: &quot;0&quot;, color: &quot;#6B7280&quot;, fontSize: &quot;14px&quot;, fontWeight: &quot;500&quot; }}>
                                Fiscal Year:
                              </p>
                            </td>
                            <td style={{ padding: &quot;8px 0&quot;, verticalAlign: &quot;top&quot; }}>
                              <p style={{ margin: &quot;0&quot;, color: &quot;#374151&quot;, fontSize: &quot;14px&quot; }}>
                                Year ended September 30, 2024
                              </p>
                            </td>
                          </tr>
                          <tr>
                            <td style={{ padding: &quot;8px 0&quot;, width: &quot;120px&quot;, verticalAlign: &quot;top&quot; }}>
                              <p style={{ margin: &quot;0&quot;, color: &quot;#6B7280&quot;, fontSize: &quot;14px&quot;, fontWeight: &quot;500&quot; }}>
                                Filed Date:
                              </p>
                            </td>
                            <td style={{ padding: &quot;8px 0&quot;, verticalAlign: &quot;top&quot; }}>
                              <p style={{ margin: &quot;0&quot;, color: &quot;#374151&quot;, fontSize: &quot;14px&quot; }}>June 4, 2025</p>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Financial Highlights */}
              <table
                width=&quot;100%&quot;
                cellPadding=&quot;0&quot;
                cellSpacing=&quot;0&quot;
                style={{
                  backgroundColor: &quot;#fafafa&quot;,
                  border: &quot;1px solid #e2e8f0&quot;,
                  borderRadius: &quot;8px&quot;,
                  marginBottom: &quot;20px&quot;,
                  boxShadow: &quot;0 2px 4px rgba(0,0,0,0.05), 0 0 1px rgba(0,0,0,0.1)&quot;,
                  backgroundImage: &quot;linear-gradient(to bottom, #ffffff, #f9fafb)&quot;,
                }}
              >
                <tbody>
                  <tr>
                    <td style={{ padding: &quot;20px&quot; }}>
                      <h3
                        style={{
                          margin: &quot;0 0 16px&quot;,
                          color: &quot;#000000&quot;,
                          fontSize: &quot;18px&quot;,
                          fontWeight: &quot;bold&quot;,
                          borderBottom: &quot;2px solid #f1f5f9&quot;,
                          paddingBottom: &quot;8px&quot;,
                        }}
                      >
                        💰 Financial Highlights
                      </h3>

                      <table
                        width=&quot;100%&quot;
                        cellPadding=&quot;0&quot;
                        cellSpacing=&quot;0&quot;
                        style={{
                          borderCollapse: &quot;collapse&quot;,
                          border: &quot;1px solid #e2e8f0&quot;,
                          borderRadius: &quot;6px&quot;,
                          boxShadow: &quot;0 1px 2px rgba(0,0,0,0.05)&quot;,
                        }}
                      >
                        <thead>
                          <tr style={{ backgroundColor: &quot;#f1f5f9&quot; }}>
                            <th
                              style={{
                                padding: &quot;12px&quot;,
                                textAlign: &quot;left&quot;,
                                fontSize: &quot;12px&quot;,
                                fontWeight: &quot;bold&quot;,
                                color: &quot;#6B7280&quot;,
                                borderBottom: &quot;1px solid #e2e8f0&quot;,
                              }}
                            >
                              METRIC
                            </th>
                            <th
                              style={{
                                padding: &quot;12px&quot;,
                                textAlign: &quot;right&quot;,
                                fontSize: &quot;12px&quot;,
                                fontWeight: &quot;bold&quot;,
                                color: &quot;#6B7280&quot;,
                                borderBottom: &quot;1px solid #e2e8f0&quot;,
                              }}
                            >
                              FY 2024
                            </th>
                            <th
                              style={{
                                padding: &quot;12px&quot;,
                                textAlign: &quot;right&quot;,
                                fontSize: &quot;12px&quot;,
                                fontWeight: &quot;bold&quot;,
                                color: &quot;#6B7280&quot;,
                                borderBottom: &quot;1px solid #e2e8f0&quot;,
                              }}
                            >
                              FY 2023
                            </th>
                            <th
                              style={{
                                padding: &quot;12px&quot;,
                                textAlign: &quot;right&quot;,
                                fontSize: &quot;12px&quot;,
                                fontWeight: &quot;bold&quot;,
                                color: &quot;#6B7280&quot;,
                                borderBottom: &quot;1px solid #e2e8f0&quot;,
                              }}
                            >
                              % CHANGE
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td
                              style={{
                                padding: &quot;12px&quot;,
                                fontSize: &quot;14px&quot;,
                                color: &quot;#374151&quot;,
                                borderBottom: &quot;1px solid #f1f5f9&quot;,
                                backgroundColor: &quot;#ffffff&quot;,
                              }}
                            >
                              Revenue
                            </td>
                            <td
                              style={{
                                padding: &quot;12px&quot;,
                                textAlign: &quot;right&quot;,
                                fontSize: &quot;14px&quot;,
                                fontWeight: &quot;bold&quot;,
                                color: &quot;#374151&quot;,
                                borderBottom: &quot;1px solid #f1f5f9&quot;,
                                backgroundColor: &quot;#ffffff&quot;,
                              }}
                            >
                              $425.3B
                            </td>
                            <td
                              style={{
                                padding: &quot;12px&quot;,
                                textAlign: &quot;right&quot;,
                                fontSize: &quot;14px&quot;,
                                color: &quot;#374151&quot;,
                                borderBottom: &quot;1px solid #f1f5f9&quot;,
                                backgroundColor: &quot;#ffffff&quot;,
                              }}
                            >
                              $394.3B
                            </td>
                            <td
                              style={{
                                padding: &quot;12px&quot;,
                                textAlign: &quot;right&quot;,
                                fontSize: &quot;14px&quot;,
                                fontWeight: &quot;bold&quot;,
                                color: &quot;#10B981&quot;,
                                borderBottom: &quot;1px solid #f1f5f9&quot;,
                                backgroundColor: &quot;#ffffff&quot;,
                              }}
                            >
                              +7.9%
                            </td>
                          </tr>
                          <tr>
                            <td
                              style={{
                                padding: &quot;12px&quot;,
                                fontSize: &quot;14px&quot;,
                                color: &quot;#374151&quot;,
                                borderBottom: &quot;1px solid #f1f5f9&quot;,
                                backgroundColor: &quot;#f8fafc&quot;,
                              }}
                            >
                              Net Income
                            </td>
                            <td
                              style={{
                                padding: &quot;12px&quot;,
                                textAlign: &quot;right&quot;,
                                fontSize: &quot;14px&quot;,
                                fontWeight: &quot;bold&quot;,
                                color: &quot;#374151&quot;,
                                borderBottom: &quot;1px solid #f1f5f9&quot;,
                                backgroundColor: &quot;#f8fafc&quot;,
                              }}
                            >
                              $112.8B
                            </td>
                            <td
                              style={{
                                padding: &quot;12px&quot;,
                                textAlign: &quot;right&quot;,
                                fontSize: &quot;14px&quot;,
                                color: &quot;#374151&quot;,
                                borderBottom: &quot;1px solid #f1f5f9&quot;,
                                backgroundColor: &quot;#f8fafc&quot;,
                              }}
                            >
                              $96.9B
                            </td>
                            <td
                              style={{
                                padding: &quot;12px&quot;,
                                textAlign: &quot;right&quot;,
                                fontSize: &quot;14px&quot;,
                                fontWeight: &quot;bold&quot;,
                                color: &quot;#10B981&quot;,
                                borderBottom: &quot;1px solid #f1f5f9&quot;,
                                backgroundColor: &quot;#f8fafc&quot;,
                              }}
                            >
                              +16.4%
                            </td>
                          </tr>
                          <tr>
                            <td
                              style={{
                                padding: &quot;12px&quot;,
                                fontSize: &quot;14px&quot;,
                                color: &quot;#374151&quot;,
                                borderBottom: &quot;1px solid #f1f5f9&quot;,
                                backgroundColor: &quot;#ffffff&quot;,
                              }}
                            >
                              EPS (Diluted)
                            </td>
                            <td
                              style={{
                                padding: &quot;12px&quot;,
                                textAlign: &quot;right&quot;,
                                fontSize: &quot;14px&quot;,
                                fontWeight: &quot;bold&quot;,
                                color: &quot;#374151&quot;,
                                borderBottom: &quot;1px solid #f1f5f9&quot;,
                                backgroundColor: &quot;#ffffff&quot;,
                              }}
                            >
                              $7.28
                            </td>
                            <td
                              style={{
                                padding: &quot;12px&quot;,
                                textAlign: &quot;right&quot;,
                                fontSize: &quot;14px&quot;,
                                color: &quot;#374151&quot;,
                                borderBottom: &quot;1px solid #f1f5f9&quot;,
                                backgroundColor: &quot;#ffffff&quot;,
                              }}
                            >
                              $6.14
                            </td>
                            <td
                              style={{
                                padding: &quot;12px&quot;,
                                textAlign: &quot;right&quot;,
                                fontSize: &quot;14px&quot;,
                                fontWeight: &quot;bold&quot;,
                                color: &quot;#10B981&quot;,
                                borderBottom: &quot;1px solid #f1f5f9&quot;,
                                backgroundColor: &quot;#ffffff&quot;,
                              }}
                            >
                              +18.6%
                            </td>
                          </tr>
                          <tr>
                            <td
                              style={{
                                padding: &quot;12px&quot;,
                                fontSize: &quot;14px&quot;,
                                color: &quot;#374151&quot;,
                                backgroundColor: &quot;#f8fafc&quot;,
                              }}
                            >
                              Cash & Equivalents
                            </td>
                            <td
                              style={{
                                padding: &quot;12px&quot;,
                                textAlign: &quot;right&quot;,
                                fontSize: &quot;14px&quot;,
                                fontWeight: &quot;bold&quot;,
                                color: &quot;#374151&quot;,
                                backgroundColor: &quot;#f8fafc&quot;,
                              }}
                            >
                              $73.2B
                            </td>
                            <td
                              style={{
                                padding: &quot;12px&quot;,
                                textAlign: &quot;right&quot;,
                                fontSize: &quot;14px&quot;,
                                color: &quot;#374151&quot;,
                                backgroundColor: &quot;#f8fafc&quot;,
                              }}
                            >
                              $62.5B
                            </td>
                            <td
                              style={{
                                padding: &quot;12px&quot;,
                                textAlign: &quot;right&quot;,
                                fontSize: &quot;14px&quot;,
                                fontWeight: &quot;bold&quot;,
                                color: &quot;#10B981&quot;,
                                backgroundColor: &quot;#f8fafc&quot;,
                              }}
                            >
                              +17.1%
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Segment Performance */}
              <table
                width=&quot;100%&quot;
                cellPadding=&quot;0&quot;
                cellSpacing=&quot;0&quot;
                style={{
                  backgroundColor: &quot;#fafafa&quot;,
                  border: &quot;1px solid #e2e8f0&quot;,
                  borderRadius: &quot;8px&quot;,
                  marginBottom: &quot;20px&quot;,
                  boxShadow: &quot;0 2px 4px rgba(0,0,0,0.05), 0 0 1px rgba(0,0,0,0.1)&quot;,
                  backgroundImage: &quot;linear-gradient(to bottom, #ffffff, #f9fafb)&quot;,
                }}
              >
                <tbody>
                  <tr>
                    <td style={{ padding: &quot;20px&quot; }}>
                      <h3
                        style={{
                          margin: &quot;0 0 16px&quot;,
                          color: &quot;#000000&quot;,
                          fontSize: &quot;18px&quot;,
                          fontWeight: &quot;bold&quot;,
                          borderBottom: &quot;2px solid #f1f5f9&quot;,
                          paddingBottom: &quot;8px&quot;,
                        }}
                      >
                        📱 Segment Performance
                      </h3>

                      <table
                        width=&quot;100%&quot;
                        cellPadding=&quot;0&quot;
                        cellSpacing=&quot;0&quot;
                        style={{
                          borderCollapse: &quot;collapse&quot;,
                          border: &quot;1px solid #e2e8f0&quot;,
                          borderRadius: &quot;6px&quot;,
                          boxShadow: &quot;0 1px 2px rgba(0,0,0,0.05)&quot;,
                        }}
                      >
                        <thead>
                          <tr style={{ backgroundColor: &quot;#f1f5f9&quot; }}>
                            <th
                              style={{
                                padding: &quot;12px&quot;,
                                textAlign: &quot;left&quot;,
                                fontSize: &quot;12px&quot;,
                                fontWeight: &quot;bold&quot;,
                                color: &quot;#6B7280&quot;,
                                borderBottom: &quot;1px solid #e2e8f0&quot;,
                              }}
                            >
                              PRODUCT
                            </th>
                            <th
                              style={{
                                padding: &quot;12px&quot;,
                                textAlign: &quot;right&quot;,
                                fontSize: &quot;12px&quot;,
                                fontWeight: &quot;bold&quot;,
                                color: &quot;#6B7280&quot;,
                                borderBottom: &quot;1px solid #e2e8f0&quot;,
                              }}
                            >
                              REVENUE
                            </th>
                            <th
                              style={{
                                padding: &quot;12px&quot;,
                                textAlign: &quot;right&quot;,
                                fontSize: &quot;12px&quot;,
                                fontWeight: &quot;bold&quot;,
                                color: &quot;#6B7280&quot;,
                                borderBottom: &quot;1px solid #e2e8f0&quot;,
                              }}
                            >
                              % OF TOTAL
                            </th>
                            <th
                              style={{
                                padding: &quot;12px&quot;,
                                textAlign: &quot;right&quot;,
                                fontSize: &quot;12px&quot;,
                                fontWeight: &quot;bold&quot;,
                                color: &quot;#6B7280&quot;,
                                borderBottom: &quot;1px solid #e2e8f0&quot;,
                              }}
                            >
                              YOY CHANGE
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td
                              style={{
                                padding: &quot;12px&quot;,
                                fontSize: &quot;14px&quot;,
                                color: &quot;#374151&quot;,
                                borderBottom: &quot;1px solid #f1f5f9&quot;,
                                backgroundColor: &quot;#ffffff&quot;,
                              }}
                            >
                              iPhone
                            </td>
                            <td
                              style={{
                                padding: &quot;12px&quot;,
                                textAlign: &quot;right&quot;,
                                fontSize: &quot;14px&quot;,
                                fontWeight: &quot;bold&quot;,
                                color: &quot;#374151&quot;,
                                borderBottom: &quot;1px solid #f1f5f9&quot;,
                                backgroundColor: &quot;#ffffff&quot;,
                              }}
                            >
                              $225.8B
                            </td>
                            <td
                              style={{
                                padding: &quot;12px&quot;,
                                textAlign: &quot;right&quot;,
                                fontSize: &quot;14px&quot;,
                                color: &quot;#374151&quot;,
                                borderBottom: &quot;1px solid #f1f5f9&quot;,
                                backgroundColor: &quot;#ffffff&quot;,
                              }}
                            >
                              53.1%
                            </td>
                            <td
                              style={{
                                padding: &quot;12px&quot;,
                                textAlign: &quot;right&quot;,
                                fontSize: &quot;14px&quot;,
                                fontWeight: &quot;bold&quot;,
                                color: &quot;#10B981&quot;,
                                borderBottom: &quot;1px solid #f1f5f9&quot;,
                                backgroundColor: &quot;#ffffff&quot;,
                              }}
                            >
                              +5.2%
                            </td>
                          </tr>
                          <tr>
                            <td
                              style={{
                                padding: &quot;12px&quot;,
                                fontSize: &quot;14px&quot;,
                                color: &quot;#374151&quot;,
                                borderBottom: &quot;1px solid #f1f5f9&quot;,
                                backgroundColor: &quot;#f8fafc&quot;,
                              }}
                            >
                              Services
                            </td>
                            <td
                              style={{
                                padding: &quot;12px&quot;,
                                textAlign: &quot;right&quot;,
                                fontSize: &quot;14px&quot;,
                                fontWeight: &quot;bold&quot;,
                                color: &quot;#374151&quot;,
                                borderBottom: &quot;1px solid #f1f5f9&quot;,
                                backgroundColor: &quot;#f8fafc&quot;,
                              }}
                            >
                              $95.2B
                            </td>
                            <td
                              style={{
                                padding: &quot;12px&quot;,
                                textAlign: &quot;right&quot;,
                                fontSize: &quot;14px&quot;,
                                color: &quot;#374151&quot;,
                                borderBottom: &quot;1px solid #f1f5f9&quot;,
                                backgroundColor: &quot;#f8fafc&quot;,
                              }}
                            >
                              22.4%
                            </td>
                            <td
                              style={{
                                padding: &quot;12px&quot;,
                                textAlign: &quot;right&quot;,
                                fontSize: &quot;14px&quot;,
                                fontWeight: &quot;bold&quot;,
                                color: &quot;#10B981&quot;,
                                borderBottom: &quot;1px solid #f1f5f9&quot;,
                                backgroundColor: &quot;#f8fafc&quot;,
                              }}
                            >
                              +18.3%
                            </td>
                          </tr>
                          <tr>
                            <td
                              style={{
                                padding: &quot;12px&quot;,
                                fontSize: &quot;14px&quot;,
                                color: &quot;#374151&quot;,
                                borderBottom: &quot;1px solid #f1f5f9&quot;,
                                backgroundColor: &quot;#ffffff&quot;,
                              }}
                            >
                              Mac
                            </td>
                            <td
                              style={{
                                padding: &quot;12px&quot;,
                                textAlign: &quot;right&quot;,
                                fontSize: &quot;14px&quot;,
                                fontWeight: &quot;bold&quot;,
                                color: &quot;#374151&quot;,
                                borderBottom: &quot;1px solid #f1f5f9&quot;,
                                backgroundColor: &quot;#ffffff&quot;,
                              }}
                            >
                              $42.3B
                            </td>
                            <td
                              style={{
                                padding: &quot;12px&quot;,
                                textAlign: &quot;right&quot;,
                                fontSize: &quot;14px&quot;,
                                color: &quot;#374151&quot;,
                                borderBottom: &quot;1px solid #f1f5f9&quot;,
                                backgroundColor: &quot;#ffffff&quot;,
                              }}
                            >
                              9.9%
                            </td>
                            <td
                              style={{
                                padding: &quot;12px&quot;,
                                textAlign: &quot;right&quot;,
                                fontSize: &quot;14px&quot;,
                                fontWeight: &quot;bold&quot;,
                                color: &quot;#10B981&quot;,
                                borderBottom: &quot;1px solid #f1f5f9&quot;,
                                backgroundColor: &quot;#ffffff&quot;,
                              }}
                            >
                              +3.7%
                            </td>
                          </tr>
                          <tr>
                            <td
                              style={{
                                padding: &quot;12px&quot;,
                                fontSize: &quot;14px&quot;,
                                color: &quot;#374151&quot;,
                                borderBottom: &quot;1px solid #f1f5f9&quot;,
                                backgroundColor: &quot;#f8fafc&quot;,
                              }}
                            >
                              iPad
                            </td>
                            <td
                              style={{
                                padding: &quot;12px&quot;,
                                textAlign: &quot;right&quot;,
                                fontSize: &quot;14px&quot;,
                                fontWeight: &quot;bold&quot;,
                                color: &quot;#374151&quot;,
                                borderBottom: &quot;1px solid #f1f5f9&quot;,
                                backgroundColor: &quot;#f8fafc&quot;,
                              }}
                            >
                              $28.7B
                            </td>
                            <td
                              style={{
                                padding: &quot;12px&quot;,
                                textAlign: &quot;right&quot;,
                                fontSize: &quot;14px&quot;,
                                color: &quot;#374151&quot;,
                                borderBottom: &quot;1px solid #f1f5f9&quot;,
                                backgroundColor: &quot;#f8fafc&quot;,
                              }}
                            >
                              6.7%
                            </td>
                            <td
                              style={{
                                padding: &quot;12px&quot;,
                                textAlign: &quot;right&quot;,
                                fontSize: &quot;14px&quot;,
                                fontWeight: &quot;bold&quot;,
                                color: &quot;#EF4444&quot;,
                                borderBottom: &quot;1px solid #f1f5f9&quot;,
                                backgroundColor: &quot;#f8fafc&quot;,
                              }}
                            >
                              -2.1%
                            </td>
                          </tr>
                          <tr>
                            <td
                              style={{
                                padding: &quot;12px&quot;,
                                fontSize: &quot;14px&quot;,
                                color: &quot;#374151&quot;,
                                backgroundColor: &quot;#ffffff&quot;,
                              }}
                            >
                              Wearables, Home & Accessories
                            </td>
                            <td
                              style={{
                                padding: &quot;12px&quot;,
                                textAlign: &quot;right&quot;,
                                fontSize: &quot;14px&quot;,
                                fontWeight: &quot;bold&quot;,
                                color: &quot;#374151&quot;,
                                backgroundColor: &quot;#ffffff&quot;,
                              }}
                            >
                              $33.3B
                            </td>
                            <td
                              style={{
                                padding: &quot;12px&quot;,
                                textAlign: &quot;right&quot;,
                                fontSize: &quot;14px&quot;,
                                color: &quot;#374151&quot;,
                                backgroundColor: &quot;#ffffff&quot;,
                              }}
                            >
                              7.8%
                            </td>
                            <td
                              style={{
                                padding: &quot;12px&quot;,
                                textAlign: &quot;right&quot;,
                                fontSize: &quot;14px&quot;,
                                fontWeight: &quot;bold&quot;,
                                color: &quot;#10B981&quot;,
                                backgroundColor: &quot;#ffffff&quot;,
                              }}
                            >
                              +12.5%
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Key Developments */}
              <table
                width=&quot;100%&quot;
                cellPadding=&quot;0&quot;
                cellSpacing=&quot;0&quot;
                style={{
                  backgroundColor: &quot;#fafafa&quot;,
                  border: &quot;1px solid #e2e8f0&quot;,
                  borderRadius: &quot;8px&quot;,
                  boxShadow: &quot;0 2px 4px rgba(0,0,0,0.05), 0 0 1px rgba(0,0,0,0.1)&quot;,
                  backgroundImage: &quot;linear-gradient(to bottom, #ffffff, #f9fafb)&quot;,
                }}
              >
                <tbody>
                  <tr>
                    <td style={{ padding: &quot;20px&quot; }}>
                      <h3
                        style={{
                          margin: &quot;0 0 12px&quot;,
                          color: &quot;#000000&quot;,
                          fontSize: &quot;18px&quot;,
                          fontWeight: &quot;bold&quot;,
                          borderBottom: &quot;2px solid #f1f5f9&quot;,
                          paddingBottom: &quot;8px&quot;,
                        }}
                      >
                        🔍 Key Developments
                      </h3>
                      <ul
                        style={{
                          margin: &quot;0&quot;,
                          paddingLeft: &quot;20px&quot;,
                          color: &quot;#374151&quot;,
                          fontSize: &quot;14px&quot;,
                          lineHeight: &quot;1.6&quot;,
                        }}
                      >
                        <li style={{ marginBottom: &quot;8px&quot; }}>
                          <strong>AI Integration:</strong> Significant investments in artificial intelligence
                          capabilities across product lines, with new AI features in iOS 18 and macOS 15.
                        </li>
                        <li style={{ marginBottom: &quot;8px&quot; }}>
                          <strong>Services Growth:</strong> Services revenue reached an all-time high, driven by 975
                          million paid subscriptions across the platform.
                        </li>
                        <li style={{ marginBottom: &quot;8px&quot; }}>
                          <strong>Supply Chain:</strong> Continued diversification of manufacturing locations, with
                          increased production in India and Vietnam.
                        </li>
                        <li style={{ marginBottom: &quot;8px&quot; }}>
                          <strong>Capital Return:</strong> Returned $110 billion to shareholders through dividends and
                          share repurchases.
                        </li>
                        <li>
                          <strong>Environmental Goals:</strong> On track to achieve carbon neutrality for entire
                          business by 2030, with 25 suppliers committed to 100% renewable energy.
                        </li>
                      </ul>
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Footer */}
      <table
        width=&quot;100%&quot;
        cellPadding=&quot;0&quot;
        cellSpacing=&quot;0&quot;
        style={{
          backgroundColor: &quot;white&quot;,
          borderRadius: &quot;0 0 12px 12px&quot;,
          border: &quot;1px solid #e2e8f0&quot;,
          borderTop: &quot;none&quot;,
        }}
      >
        <tbody>
          <tr>
            <td style={{ padding: &quot;20px&quot;, textAlign: &quot;center&quot; }}>
              <a
                href=&quot;#&quot;
                style={{
                  display: &quot;inline-block&quot;,
                  padding: &quot;12px 24px&quot;,
                  background: &quot;linear-gradient(135deg, #7C3AED 0%, #EC4899 100%)&quot;,
                  color: &quot;white&quot;,
                  textDecoration: &quot;none&quot;,
                  borderRadius: &quot;8px&quot;,
                  fontSize: &quot;14px&quot;,
                  fontWeight: &quot;bold&quot;,
                }}
              >
                View on SEC Website
              </a>
              <p style={{ margin: &quot;16px 0 0&quot;, color: &quot;#6B7280&quot;, fontSize: &quot;12px&quot; }}>
                © 2025 tldrSEC. All rights reserved.
              </p>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
