import { FilingTemplateData } from &apos;../../../../lib/email/types&apos;;

interface Schedule13DTemplateProps {
  filing: FilingTemplateData;
}

export default function Schedule13DEmailTemplate({ filing }: Schedule13DTemplateProps) {
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
                        {filing.companyName} ({filing.symbol || filing.ticker}) - Schedule 13D Filing
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
                                {filing.summaryData?.acquisitionDate || &apos;N/A&apos;} Reporting Person:
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
                                Form Type:
                              </p>
                            </td>
                            <td style={{ padding: &quot;8px 0&quot;, verticalAlign: &quot;top&quot; }}>
                              <p style={{ margin: &quot;0&quot;, color: &quot;#374151&quot;, fontSize: &quot;14px&quot; }}>
                                Schedule 13D (Beneficial Ownership)
                              </p>
                            </td>
                          </tr>
                          <tr>
                            <td style={{ padding: &quot;8px 0&quot;, width: &quot;140px&quot;, verticalAlign: &quot;top&quot; }}>
                              <p style={{ margin: &quot;0&quot;, color: &quot;#6B7280&quot;, fontSize: &quot;14px&quot;, fontWeight: &quot;500&quot; }}>
                                Acquisition Date:
                              </p>
                            </td>
                            <td style={{ padding: &quot;8px 0&quot;, verticalAlign: &quot;top&quot; }}>
                              <p style={{ margin: &quot;0&quot;, color: &quot;#374151&quot;, fontSize: &quot;14px&quot; }}>{filing.summaryData?.acquisitionDate || &apos;N/A&apos;}</p>
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
                          <tr>
                            <td style={{ padding: &quot;8px 0&quot;, width: &quot;140px&quot;, verticalAlign: &quot;top&quot; }}>
                              <p style={{ margin: &quot;0&quot;, color: &quot;#6B7280&quot;, fontSize: &quot;14px&quot;, fontWeight: &quot;500&quot; }}>
                                Purpose:
                              </p>
                            </td>
                            <td style={{ padding: &quot;8px 0&quot;, verticalAlign: &quot;top&quot; }}>
                              <p style={{ margin: &quot;0&quot;, color: &quot;#374151&quot;, fontSize: &quot;14px&quot; }}>
                                {filing.summaryData?.purpose || &apos;N/A&apos;}
                              </p>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Ownership Details */}
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
                        📊 Ownership Position
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
                              AMOUNT
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
                              PERCENTAGE
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
                              Shares Beneficially Owned
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
                              {filing.summaryData?.sharesBeneficiallyOwned || &apos;N/A&apos;}
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
                              {filing.summaryData?.ownershipPercentage || &apos;N/A&apos;}%
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
                              Sole Voting Power
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
                              {filing.summaryData?.soleVotingPower || &apos;N/A&apos;}
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
                              {filing.summaryData?.ownershipPercentage || &apos;N/A&apos;}%
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
                              Sole Dispositive Power
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
                              {filing.summaryData?.soleDispositivePower || &apos;N/A&apos;}
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
                              {filing.summaryData?.ownershipPercentage || &apos;N/A&apos;}%
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
                              Aggregate Purchase Price
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
                              {filing.summaryData?.aggregatePurchasePrice || &apos;N/A&apos;}
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
                              {filing.summaryData?.pricePerShare || &apos;N/A&apos;} per share
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Purpose and Plans */}
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
                        🎯 Purpose and Plans
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
                          Investment Thesis
                        </h4>
                        <p style={{ margin: &quot;0&quot;, color: &quot;#374151&quot;, fontSize: &quot;14px&quot;, lineHeight: &quot;1.6&quot; }}>
                          Starboard Value believes Twitter is significantly undervalued and has identified multiple
                          opportunities to enhance shareholder value through operational improvements, cost
                          optimization, and strategic initiatives.
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
                          Proposed Actions
                        </h4>
                        <ul
                          style={{
                            margin: &quot;0&quot;,
                            paddingLeft: &quot;20px&quot;,
                            color: &quot;#374151&quot;,
                            fontSize: &quot;14px&quot;,
                            lineHeight: &quot;1.6&quot;,
                          }}
                        >
                          <li>Engage with management and board on strategic alternatives</li>
                          <li>Advocate for improved operational efficiency and cost structure</li>
                          <li>Explore potential board representation</li>
                          <li>Consider merger and acquisition opportunities</li>
                        </ul>
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
                          Timeline
                        </h4>
                        <p style={{ margin: &quot;0&quot;, color: &quot;#374151&quot;, fontSize: &quot;14px&quot;, lineHeight: &quot;1.6&quot; }}>
                          {filing.summaryData?.timeline || &apos;The reporting person has disclosed their intentions regarding future actions as required by Schedule 13D regulations.&apos;}
                        </p>
                      </div>
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
                        📈 Market Impact
                      </h3>
                      <p style={{ margin: &quot;0 0 12px&quot;, color: &quot;#374151&quot;, fontSize: &quot;14px&quot;, lineHeight: &quot;1.6&quot; }}>
                        {filing.summaryData?.marketImpact || &apos;Market reaction to this filing has not been analyzed.&apos;}
                      </p>
                      <p style={{ margin: &quot;0&quot;, color: &quot;#374151&quot;, fontSize: &quot;14px&quot;, lineHeight: &quot;1.6&quot; }}>
                        {filing.summaryData?.investmentContext || &apos;This filing represents a significant ownership position that may impact the company\&apos;s strategic direction.&apos;}
                      </p>
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
