import { FilingTemplateData } from &apos;../../../../lib/email/types&apos;;

interface FormDEF14ATemplateProps {
  filing: FilingTemplateData;
}

export default function FormDEF14AEmailTemplate({ filing }: FormDEF14ATemplateProps) {
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
              <p style={{ margin: &quot;12px 0 0&quot;, fontSize: &quot;18px&quot;, opacity: &quot;0.9&quot; }}>{new Date().toLocaleDateString()}</p>
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
                        {filing.companyName} ({filing.symbol || filing.ticker}) - Form DEF 14A Filing
                      </h2>
                      <p style={{ margin: &quot;8px 0 20px&quot;, color: &quot;#64748b&quot;, fontSize: &quot;14px&quot; }}>Filed on: {new Date(filing.filingDate).toLocaleDateString()}</p>
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
                            <td style={{ padding: &quot;8px 0&quot;, width: &quot;140px&quot;, verticalAlign: &quot;top&quot; }}>
                              <p style={{ margin: &quot;0&quot;, color: &quot;#6B7280&quot;, fontSize: &quot;14px&quot;, fontWeight: &quot;500&quot; }}>
                                Company:
                              </p>
                            </td>
                            <td style={{ padding: &quot;8px 0&quot;, verticalAlign: &quot;top&quot; }}>
                              <p style={{ margin: &quot;0&quot;, color: &quot;#374151&quot;, fontSize: &quot;14px&quot;, fontWeight: &quot;600&quot; }}>
                                {filing.companyName}
                              </p>
                            </td>
                          </tr>
                          <tr>
                            <td style={{ padding: &quot;8px 0&quot;, width: &quot;140px&quot;, verticalAlign: &quot;top&quot; }}>
                              <p style={{ margin: &quot;0&quot;, color: &quot;#6B7280&quot;, fontSize: &quot;14px&quot;, fontWeight: &quot;500&quot; }}>
                                Form Type:
                              </p>
                            </td>
                            <td style={{ padding: &quot;8px 0&quot;, verticalAlign: &quot;top&quot; }}>
                              <p style={{ margin: &quot;0&quot;, color: &quot;#374151&quot;, fontSize: &quot;14px&quot; }}>
                                {filing.summaryData?.meetingDate || &apos;N/A&apos;}14A (Proxy Statement)
                              </p>
                            </td>
                          </tr>
                          <tr>
                            <td style={{ padding: &quot;8px 0&quot;, width: &quot;140px&quot;, verticalAlign: &quot;top&quot; }}>
                              <p style={{ margin: &quot;0&quot;, color: &quot;#6B7280&quot;, fontSize: &quot;14px&quot;, fontWeight: &quot;500&quot; }}>
                                Meeting Date:
                              </p>
                            </td>
                            <td style={{ padding: &quot;8px 0&quot;, verticalAlign: &quot;top&quot; }}>
                              <p style={{ margin: &quot;0&quot;, color: &quot;#374151&quot;, fontSize: &quot;14px&quot; }}>July 15, 2025</p>
                            </td>
                          </tr>
                          <tr>
                            <td style={{ padding: &quot;8px 0&quot;, width: &quot;140px&quot;, verticalAlign: &quot;top&quot; }}>
                              <p style={{ margin: &quot;0&quot;, color: &quot;#6B7280&quot;, fontSize: &quot;14px&quot;, fontWeight: &quot;500&quot; }}>
                                Record Date:
                              </p>
                            </td>
                            <td style={{ padding: &quot;8px 0&quot;, verticalAlign: &quot;top&quot; }}>
                              <p style={{ margin: &quot;0&quot;, color: &quot;#374151&quot;, fontSize: &quot;14px&quot; }}>May 20, 2025</p>
                            </td>
                          </tr>
                          <tr>
                            <td style={{ padding: &quot;8px 0&quot;, width: &quot;140px&quot;, verticalAlign: &quot;top&quot; }}>
                              <p style={{ margin: &quot;0&quot;, color: &quot;#6B7280&quot;, fontSize: &quot;14px&quot;, fontWeight: &quot;500&quot; }}>
                                Meeting Type:
                              </p>
                            </td>
                            <td style={{ padding: &quot;8px 0&quot;, verticalAlign: &quot;top&quot; }}>
                              <p style={{ margin: &quot;0&quot;, color: &quot;#374151&quot;, fontSize: &quot;14px&quot; }}>
                                Annual Shareholder Meeting
                              </p>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Voting Matters */}
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
                        🗳️ Voting Matters
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
                              PROPOSAL
                            </th>
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
                              DESCRIPTION
                            </th>
                            <th
                              style={{
                                padding: &quot;12px&quot;,
                                textAlign: &quot;center&quot;,
                                fontSize: &quot;12px&quot;,
                                fontWeight: &quot;bold&quot;,
                                color: &quot;#6B7280&quot;,
                                borderBottom: &quot;1px solid #e2e8f0&quot;,
                              }}
                            >
                              BOARD REC.
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
                                fontWeight: &quot;bold&quot;,
                              }}
                            >
                              Proposal 1
                            </td>
                            <td
                              style={{
                                padding: &quot;12px&quot;,
                                fontSize: &quot;14px&quot;,
                                color: &quot;#374151&quot;,
                                borderBottom: &quot;1px solid #f1f5f9&quot;,
                                backgroundColor: &quot;#ffffff&quot;,
                              }}
                            >
                              Election of 11 directors to serve one-year terms
                            </td>
                            <td
                              style={{
                                padding: &quot;12px&quot;,
                                textAlign: &quot;center&quot;,
                                borderBottom: &quot;1px solid #f1f5f9&quot;,
                                backgroundColor: &quot;#ffffff&quot;,
                              }}
                            >
                              <span
                                style={{
                                  color: &quot;#10B981&quot;,
                                  fontSize: &quot;14px&quot;,
                                  fontWeight: &quot;bold&quot;,
                                }}
                              >
                                FOR
                              </span>
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
                                fontWeight: &quot;bold&quot;,
                              }}
                            >
                              Proposal 2
                            </td>
                            <td
                              style={{
                                padding: &quot;12px&quot;,
                                fontSize: &quot;14px&quot;,
                                color: &quot;#374151&quot;,
                                borderBottom: &quot;1px solid #f1f5f9&quot;,
                                backgroundColor: &quot;#f8fafc&quot;,
                              }}
                            >
                              Advisory vote on executive compensation
                            </td>
                            <td
                              style={{
                                padding: &quot;12px&quot;,
                                textAlign: &quot;center&quot;,
                                borderBottom: &quot;1px solid #f1f5f9&quot;,
                                backgroundColor: &quot;#f8fafc&quot;,
                              }}
                            >
                              <span
                                style={{
                                  color: &quot;#10B981&quot;,
                                  fontSize: &quot;14px&quot;,
                                  fontWeight: &quot;bold&quot;,
                                }}
                              >
                                FOR
                              </span>
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
                                fontWeight: &quot;bold&quot;,
                              }}
                            >
                              Proposal 3
                            </td>
                            <td
                              style={{
                                padding: &quot;12px&quot;,
                                fontSize: &quot;14px&quot;,
                                color: &quot;#374151&quot;,
                                borderBottom: &quot;1px solid #f1f5f9&quot;,
                                backgroundColor: &quot;#ffffff&quot;,
                              }}
                            >
                              Ratification of PwC as independent auditor
                            </td>
                            <td
                              style={{
                                padding: &quot;12px&quot;,
                                textAlign: &quot;center&quot;,
                                borderBottom: &quot;1px solid #f1f5f9&quot;,
                                backgroundColor: &quot;#ffffff&quot;,
                              }}
                            >
                              <span
                                style={{
                                  color: &quot;#10B981&quot;,
                                  fontSize: &quot;14px&quot;,
                                  fontWeight: &quot;bold&quot;,
                                }}
                              >
                                FOR
                              </span>
                            </td>
                          </tr>
                          <tr>
                            <td
                              style={{
                                padding: &quot;12px&quot;,
                                fontSize: &quot;14px&quot;,
                                color: &quot;#374151&quot;,
                                backgroundColor: &quot;#f8fafc&quot;,
                                fontWeight: &quot;bold&quot;,
                              }}
                            >
                              Proposal 4
                            </td>
                            <td
                              style={{
                                padding: &quot;12px&quot;,
                                fontSize: &quot;14px&quot;,
                                color: &quot;#374151&quot;,
                                backgroundColor: &quot;#f8fafc&quot;,
                              }}
                            >
                              Shareholder proposal on sustainability reporting
                            </td>
                            <td
                              style={{
                                padding: &quot;12px&quot;,
                                textAlign: &quot;center&quot;,
                                backgroundColor: &quot;#f8fafc&quot;,
                              }}
                            >
                              <span
                                style={{
                                  color: &quot;#EF4444&quot;,
                                  fontSize: &quot;14px&quot;,
                                  fontWeight: &quot;bold&quot;,
                                }}
                              >
                                AGAINST
                              </span>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Executive Compensation */}
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
                        💰 Executive Compensation Highlights
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
                              EXECUTIVE
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
                              TOTAL COMP. 2024
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
                              <div>
                                <p style={{ margin: &quot;0&quot;, fontWeight: &quot;bold&quot; }}>Reed Hastings</p>
                                <p style={{ margin: &quot;0&quot;, fontSize: &quot;12px&quot;, color: &quot;#6B7280&quot; }}>Co-CEO</p>
                              </div>
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
                              $40.8M
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
                              +12.3%
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
                              <div>
                                <p style={{ margin: &quot;0&quot;, fontWeight: &quot;bold&quot; }}>Ted Sarandos</p>
                                <p style={{ margin: &quot;0&quot;, fontSize: &quot;12px&quot;, color: &quot;#6B7280&quot; }}>Co-CEO</p>
                              </div>
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
                              $38.2M
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
                              +8.7%
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
                              <div>
                                <p style={{ margin: &quot;0&quot;, fontWeight: &quot;bold&quot; }}>Spencer Neumann</p>
                                <p style={{ margin: &quot;0&quot;, fontSize: &quot;12px&quot;, color: &quot;#6B7280&quot; }}>CFO</p>
                              </div>
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
                              $16.9M
                            </td>
                            <td
                              style={{
                                padding: &quot;12px&quot;,
                                textAlign: &quot;right&quot;,
                                fontSize: &quot;14px&quot;,
                                fontWeight: &quot;bold&quot;,
                                color: &quot;#EF4444&quot;,
                                backgroundColor: &quot;#ffffff&quot;,
                              }}
                            >
                              -3.2%
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Board Changes */}
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
                        👥 Board Structure & Changes
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
                          <strong>New Director Nominee:</strong> {filing.summaryData?.boardChanges?.[0]?.name ? `${filing.summaryData.boardChanges[0].name}, ${filing.summaryData.boardChanges[0].role}` : &apos;No new director nominees&apos;}
                        </li>
                        <li style={{ marginBottom: &quot;8px&quot; }}>
                          <strong>Board Independence:</strong> {filing.summaryData?.boardIndependence || &apos;Information not available&apos;}
                        </li>
                        <li style={{ marginBottom: &quot;8px&quot; }}>
                          <strong>Diversity:</strong> {filing.summaryData?.boardDiversity || &apos;Information not available&apos;}
                        </li>
                        <li style={{ marginBottom: &quot;8px&quot; }}>
                          <strong>Committee Changes:</strong> {filing.summaryData?.committeeChanges || &apos;No committee changes reported&apos;}
                        </li>
                        <li>
                          <strong>Term Limits:</strong> {filing.summaryData?.termLimits || &apos;Information not available&apos;}
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
                href={filing.filingUrl}
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
