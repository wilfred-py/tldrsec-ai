import { FilingTemplateData } from '../../../../lib/email/types';

interface Form144TemplateProps {
  filing: FilingTemplateData;
}

export default function Form144EmailTemplate({ filing }: Form144TemplateProps) {
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
                        {filing.companyName} ({filing.symbol || filing.ticker}) - Form 144 Filing
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
                                Reporting Person:
                              </p>
                            </td>
                            <td style={{ padding: &quot;8px 0&quot;, verticalAlign: &quot;top&quot; }}>
                              <p style={{ margin: &quot;0&quot;, color: &quot;#374151&quot;, fontSize: &quot;14px&quot;, fontWeight: &quot;600&quot; }}>
                                {filing.summaryData?.reportingPerson || &apos;N/A&apos;}
                              </p>
                            </td>
                          </tr>
                          <tr>
                            <td style={{ padding: &quot;8px 0&quot;, width: &quot;140px&quot;, verticalAlign: &quot;top&quot; }}>
                              <p style={{ margin: &quot;0&quot;, color: &quot;#6B7280&quot;, fontSize: &quot;14px&quot;, fontWeight: &quot;500&quot; }}>
                                Position:
                              </p>
                            </td>
                            <td style={{ padding: &quot;8px 0&quot;, verticalAlign: &quot;top&quot; }}>
                              <p style={{ margin: &quot;0&quot;, color: &quot;#374151&quot;, fontSize: &quot;14px&quot; }}>
                                {filing.summaryData?.position || &apos;N/A&apos;}
                              </p>
                            </td>
                          </tr>
                          <tr>
                            <td style={{ padding: &quot;8px 0&quot;, width: &quot;140px&quot;, verticalAlign: &quot;top&quot; }}>
                              <p style={{ margin: &quot;0&quot;, color: &quot;#6B7280&quot;, fontSize: &quot;14px&quot;, fontWeight: &quot;500&quot; }}>
                                Transaction Type:
                              </p>
                            </td>
                            <td style={{ padding: &quot;8px 0&quot;, verticalAlign: &quot;top&quot; }}>
                              <p style={{ margin: &quot;0&quot;, color: &quot;#374151&quot;, fontSize: &quot;14px&quot; }}>
                                {filing.summaryData?.transactionType || &apos;Sale of Common Stock&apos;}
                              </p>
                            </td>
                          </tr>
                          <tr>
                            <td style={{ padding: &quot;8px 0&quot;, width: &quot;140px&quot;, verticalAlign: &quot;top&quot; }}>
                              <p style={{ margin: &quot;0&quot;, color: &quot;#6B7280&quot;, fontSize: &quot;14px&quot;, fontWeight: &quot;500&quot; }}>
                                Sale Date:
                              </p>
                            </td>
                            <td style={{ padding: &quot;8px 0&quot;, verticalAlign: &quot;top&quot; }}>
                              <p style={{ margin: &quot;0&quot;, color: &quot;#374151&quot;, fontSize: &quot;14px&quot; }}>{filing.summaryData?.saleDate || filing.summaryData?.transactionDate || new Date(filing.filingDate).toLocaleDateString()}</p>
                            </td>
                          </tr>
                          <tr>
                            <td style={{ padding: &quot;8px 0&quot;, width: &quot;140px&quot;, verticalAlign: &quot;top&quot; }}>
                              <p style={{ margin: &quot;0&quot;, color: &quot;#6B7280&quot;, fontSize: &quot;14px&quot;, fontWeight: &quot;500&quot; }}>
                                Filing Date:
                              </p>
                            </td>
                            <td style={{ padding: &quot;8px 0&quot;, verticalAlign: &quot;top&quot; }}>
                              <p style={{ margin: &quot;0&quot;, color: &quot;#374151&quot;, fontSize: &quot;14px&quot; }}>{new Date(filing.filingDate).toLocaleDateString()}</p>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Sale Details */}
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
                        💰 Intended Sale Details
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
                              SECURITY TYPE
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
                              SHARES
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
                              EST. VALUE*
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
                                backgroundColor: &quot;#ffffff&quot;,
                              }}
                            >
                              Common Stock
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
                              120,000
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
                              $144.0M
                            </td>
                          </tr>
                        </tbody>
                      </table>

                      <p
                        style={{
                          margin: &quot;12px 0 0&quot;,
                          fontSize: &quot;12px&quot;,
                          color: &quot;#6B7280&quot;,
                          fontStyle: &quot;italic&quot;,
                        }}
                      >
                        * Based on approximate market price of $1,200 per share
                      </p>
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Rule 144 Compliance */}
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
                        ✅ Rule 144 Compliance
                      </h3>

                      <div
                        style={{
                          padding: &quot;12px&quot;,
                          backgroundColor: &quot;#f8fafc&quot;,
                          borderRadius: &quot;6px&quot;,
                          marginBottom: &quot;12px&quot;,
                        }}
                      >
                        <h4
                          style={{
                            margin: &quot;0 0 8px&quot;,
                            color: &quot;#374151&quot;,
                            fontSize: &quot;16px&quot;,
                            fontWeight: &quot;bold&quot;,
                          }}
                        >
                          Holding Period Requirements
                        </h4>
                        <p style={{ margin: &quot;0&quot;, color: &quot;#374151&quot;, fontSize: &quot;14px&quot;, lineHeight: &quot;1.6&quot; }}>
                          ✓ Securities have been held for more than six months, satisfying the minimum holding period
                          requirement for restricted securities under Rule 144.
                        </p>
                      </div>

                      <div
                        style={{
                          padding: &quot;12px&quot;,
                          backgroundColor: &quot;#f8fafc&quot;,
                          borderRadius: &quot;6px&quot;,
                          marginBottom: &quot;12px&quot;,
                        }}
                      >
                        <h4
                          style={{
                            margin: &quot;0 0 8px&quot;,
                            color: &quot;#374151&quot;,
                            fontSize: &quot;16px&quot;,
                            fontWeight: &quot;bold&quot;,
                          }}
                        >
                          Volume Limitations
                        </h4>
                        <p style={{ margin: &quot;0&quot;, color: &quot;#374151&quot;, fontSize: &quot;14px&quot;, lineHeight: &quot;1.6&quot; }}>
                          ✓ The 120,000 shares represent less than 1% of NVIDIA&apos;s outstanding shares and comply with the
                          greater of 1% of outstanding shares or average weekly trading volume over the prior four
                          weeks.
                        </p>
                      </div>

                      <div
                        style={{
                          padding: &quot;12px&quot;,
                          backgroundColor: &quot;#f8fafc&quot;,
                          borderRadius: &quot;6px&quot;,
                        }}
                      >
                        <h4
                          style={{
                            margin: &quot;0 0 8px&quot;,
                            color: &quot;#374151&quot;,
                            fontSize: &quot;16px&quot;,
                            fontWeight: &quot;bold&quot;,
                          }}
                        >
                          Manner of Sale
                        </h4>
                        <p style={{ margin: &quot;0&quot;, color: &quot;#374151&quot;, fontSize: &quot;14px&quot;, lineHeight: &quot;1.6&quot; }}>
                          ✓ Sales will be conducted through ordinary brokerage transactions on NASDAQ, satisfying the
                          &quot;manner of sale&quot; requirements under Rule 144.
                        </p>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Broker Information */}
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
                        🏦 Broker Information
                      </h3>

                      <table width=&quot;100%&quot; cellPadding=&quot;0&quot; cellSpacing=&quot;0&quot; style={{ borderCollapse: &quot;collapse&quot; }}>
                        <tbody>
                          <tr>
                            <td style={{ padding: &quot;8px 0&quot;, width: &quot;140px&quot;, verticalAlign: &quot;top&quot; }}>
                              <p style={{ margin: &quot;0&quot;, color: &quot;#6B7280&quot;, fontSize: &quot;14px&quot;, fontWeight: &quot;500&quot; }}>
                                Broker Name:
                              </p>
                            </td>
                            <td style={{ padding: &quot;8px 0&quot;, verticalAlign: &quot;top&quot; }}>
                              <p style={{ margin: &quot;0&quot;, color: &quot;#374151&quot;, fontSize: &quot;14px&quot;, fontWeight: &quot;600&quot; }}>
                                Goldman Sachs & Co. LLC
                              </p>
                            </td>
                          </tr>
                          <tr>
                            <td style={{ padding: &quot;8px 0&quot;, width: &quot;140px&quot;, verticalAlign: &quot;top&quot; }}>
                              <p style={{ margin: &quot;0&quot;, color: &quot;#6B7280&quot;, fontSize: &quot;14px&quot;, fontWeight: &quot;500&quot; }}>
                                Broker Address:
                              </p>
                            </td>
                            <td style={{ padding: &quot;8px 0&quot;, verticalAlign: &quot;top&quot; }}>
                              <p style={{ margin: &quot;0&quot;, color: &quot;#374151&quot;, fontSize: &quot;14px&quot; }}>
                                200 West Street, New York, NY 10282
                              </p>
                            </td>
                          </tr>
                          <tr>
                            <td style={{ padding: &quot;8px 0&quot;, width: &quot;140px&quot;, verticalAlign: &quot;top&quot; }}>
                              <p style={{ margin: &quot;0&quot;, color: &quot;#6B7280&quot;, fontSize: &quot;14px&quot;, fontWeight: &quot;500&quot; }}>
                                Sale Method:
                              </p>
                            </td>
                            <td style={{ padding: &quot;8px 0&quot;, verticalAlign: &quot;top&quot; }}>
                              <p style={{ margin: &quot;0&quot;, color: &quot;#374151&quot;, fontSize: &quot;14px&quot; }}>
                                Ordinary brokerage transactions
                              </p>
                            </td>
                          </tr>
                          <tr>
                            <td style={{ padding: &quot;8px 0&quot;, width: &quot;140px&quot;, verticalAlign: &quot;top&quot; }}>
                              <p style={{ margin: &quot;0&quot;, color: &quot;#6B7280&quot;, fontSize: &quot;14px&quot;, fontWeight: &quot;500&quot; }}>
                                Trading Plan:
                              </p>
                            </td>
                            <td style={{ padding: &quot;8px 0&quot;, verticalAlign: &quot;top&quot; }}>
                              <p style={{ margin: &quot;0&quot;, color: &quot;#374151&quot;, fontSize: &quot;14px&quot; }}>
                                10b5-1 Trading Plan (adopted 12/15/2024)
                              </p>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Market Impact */}
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
                        📊 Market Context
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
                          <strong>Planned Sale:</strong> {filing.summaryData?.plannedSaleNote || &apos;This Form 144 represents a notice of intent to sell, not a completed transaction. The actual sale may occur over the specified time period.&apos;}
                        </li>
                        <li style={{ marginBottom: &quot;8px&quot; }}>
                          <strong>Trading Plan:</strong> {filing.summaryData?.tradingPlanNote || &apos;The sale may be part of a pre-established trading plan, indicating it was planned in advance.&apos;}
                        </li>
                        <li style={{ marginBottom: &quot;8px&quot; }}>
                          <strong>Transaction Context:</strong> {filing.summaryData?.transactionContext || &apos;Insider stock transactions are common for diversification and liquidity purposes and do not necessarily indicate sentiment about the company.&apos;}
                        </li>
                        <li>
                          <strong>Transparency:</strong> {filing.summaryData?.transparencyNote || &apos;Form 144 filings provide advance notice to the market of potential insider selling, promoting transparency and fair markets.&apos;}
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
                href={filing.filingUrl || filing.url}
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
