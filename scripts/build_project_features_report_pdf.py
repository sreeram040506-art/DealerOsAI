from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    PageBreak,
    KeepTogether,
)


OUT = "artifacts/Auto_Profit_Hub_Project_Features_Workflow.pdf"


def styles():
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "TitleCustom",
            parent=base["Title"],
            fontName="Helvetica-Bold",
            fontSize=28,
            leading=32,
            alignment=TA_CENTER,
            textColor=colors.HexColor("#0B2545"),
            spaceAfter=8,
        ),
        "subtitle": ParagraphStyle(
            "Subtitle",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=13,
            leading=17,
            alignment=TA_CENTER,
            textColor=colors.HexColor("#555555"),
            spaceAfter=16,
        ),
        "h1": ParagraphStyle(
            "Heading1Custom",
            parent=base["Heading1"],
            fontName="Helvetica-Bold",
            fontSize=15,
            leading=18,
            textColor=colors.HexColor("#2E74B5"),
            spaceBefore=14,
            spaceAfter=8,
        ),
        "h2": ParagraphStyle(
            "Heading2Custom",
            parent=base["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=12,
            leading=15,
            textColor=colors.HexColor("#1F4D78"),
            spaceBefore=10,
            spaceAfter=6,
        ),
        "body": ParagraphStyle(
            "BodyCustom",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=9.5,
            leading=13,
            textColor=colors.HexColor("#1F2933"),
            spaceAfter=6,
        ),
        "small": ParagraphStyle(
            "Small",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=8.2,
            leading=10.5,
            textColor=colors.HexColor("#1F2933"),
        ),
        "bullet": ParagraphStyle(
            "BulletCustom",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=9.2,
            leading=12.5,
            leftIndent=14,
            firstLineIndent=-9,
            spaceAfter=4,
        ),
        "table_header": ParagraphStyle(
            "TableHeader",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=8.6,
            leading=10.2,
            textColor=colors.HexColor("#1F4D78"),
            alignment=TA_LEFT,
        ),
        "table": ParagraphStyle(
            "TableCell",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=7.8,
            leading=9.8,
            textColor=colors.HexColor("#1F2933"),
        ),
    }


S = styles()


def p(text, style="body"):
    return Paragraph(text, S[style])


def h(text):
    return Paragraph(text, S["h1"])


def h2(text):
    return Paragraph(text, S["h2"])


def bullets(items):
    story = []
    for item in items:
        story.append(Paragraph(f"- {item}", S["bullet"]))
    return story


def numbered(items):
    story = []
    for i, item in enumerate(items, start=1):
        story.append(Paragraph(f"{i}. {item}", S["bullet"]))
    return story


def feature_table(rows):
    data = [[p("Area", "table_header"), p("What It Does", "table_header"), p("Main Capabilities", "table_header")]]
    for row in rows:
        data.append([p(row[0], "table"), p(row[1], "table"), p(row[2], "table")])
    table = Table(data, colWidths=[1.15 * inch, 1.85 * inch, 3.1 * inch], repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F2F4F7")),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#DADCE0")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return [table, Spacer(1, 8)]


def kv_table(rows):
    data = [[p(label, "table_header"), p(value, "table")] for label, value in rows]
    table = Table(data, colWidths=[1.55 * inch, 4.55 * inch])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#F2F4F7")),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#DADCE0")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return [table, Spacer(1, 8)]


def callout(title, text):
    table = Table([[p(f"<b>{title}:</b> {text}", "small")]], colWidths=[6.1 * inch])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F4F6F9")),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#DADCE0")),
        ("LEFTPADDING", (0, 0), (-1, -1), 9),
        ("RIGHTPADDING", (0, 0), (-1, -1), 9),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    return [table, Spacer(1, 10)]


def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.HexColor("#666666"))
    canvas.drawString(0.8 * inch, 0.45 * inch, "Auto Profit Hub - Project Features and Workflow Reference")
    canvas.drawRightString(7.7 * inch, 0.45 * inch, f"Page {doc.page}")
    canvas.restoreState()


def main():
    doc = SimpleDocTemplate(
        OUT,
        pagesize=letter,
        rightMargin=0.8 * inch,
        leftMargin=0.8 * inch,
        topMargin=0.75 * inch,
        bottomMargin=0.75 * inch,
        title="Auto Profit Hub Project Features and Workflow",
        author="Auto Profit Hub",
    )

    story = [
        Paragraph("Auto Profit Hub", S["title"]),
        Paragraph("Project Working, Workflow, and Feature Reference", S["subtitle"]),
        Paragraph(
            "Vehicle inventory, document registry, sales, customer, and profitability management system",
            S["subtitle"],
        ),
        Spacer(1, 6),
        *callout(
            "Purpose",
            "Auto Profit Hub helps a dealership track vehicles from purchase through repair, advertising, sale, customer follow-up, reporting, and document compliance.",
        ),
        h("1. Executive Summary"),
        p("The project is a full-stack vehicle inventory and dealership operations platform. It combines a React frontend, Express API, Prisma data layer, MongoDB storage, protected user authentication, multi-tenant dealership data separation, and document-processing tools for purchase and sale records."),
        *bullets([
            "Centralizes inventory, sales, expenses, repairs, advertising, customer data, reports, and used vehicle records.",
            "Supports staff, manager, admin, and platform admin workflows with role-aware screens.",
            "Automates parts of the paperwork process by extracting vehicle and sale data from documents.",
            "Calculates profitability from sale price, purchase cost, repair cost, and operating inputs.",
            "Keeps customer records connected to sold vehicles, visitors, leads, and follow-up categories.",
        ]),
        h("2. Main System Workflow"),
        *numbered([
            "User signs in and the app loads dealership-specific data.",
            "Vehicle is added manually or from a purchase/source document.",
            "Inventory stores VIN, make, model, year, mileage, color, title number, purchase cost, seller details, and document availability.",
            "Repairs, advertising, and business expenses are recorded and can be linked to vehicles where applicable.",
            "Bill of Sale is uploaded or sale is entered manually when the vehicle is sold.",
            "Sale record is created, vehicle status changes to Sold, profit is calculated, and the Used Vehicle Record is updated.",
            "Customer details from the sale are stored in Customers; users can also add visitors, leads, follow-ups, and manually linked vehicles.",
            "Dashboard, Sales, Reports, Cash Flow, and Team Analytics summarize performance.",
        ]),
        h("3. Feature Map"),
        *feature_table([
            ("Authentication", "Protects dealership data and routes.", "Login, registration, JWT sessions, role-based protected routes."),
            ("Dashboard", "Shows the operational snapshot.", "Inventory status, sales performance, profit summary, recent activity."),
            ("Inventory", "Tracks every vehicle lifecycle.", "Add/edit/delete vehicles, statuses, purchase data, documents, repairs, sale action."),
            ("Sales", "Stores finalized sales.", "Sale table/cards, revenue, profit, bill-of-sale documents, edit/delete sale records."),
            ("Customers", "Manages buyers, visitors, and leads.", "Manual add, edit contact, categories, linked inventory vehicles, search, import from sales."),
            ("Used Forms", "Handles document-driven workflows.", "Bill of Sale upload, repair bill upload, used vehicle form generation."),
            ("Registry", "Maintains document compliance data.", "Used Vehicle Record entries, acquisition/disposition details, document updates."),
            ("Repairs", "Adds vehicle reconditioning cost.", "Parts/labor cost, shop, repair description, vehicle profit impact."),
            ("Advertising", "Tracks campaign spend.", "Campaigns, platforms, dates, spend, optional vehicle link."),
            ("Expenses", "Tracks operating costs.", "Business expense categories, date, notes, edit/delete."),
            ("Reports", "Exports and summarizes results.", "Revenue report, sales breakdown, profit reporting."),
            ("Team", "Admin visibility into staff activity.", "Users, roles, sales activity, performance analytics."),
            ("Settings", "Dealership profile management.", "Name, address, phone, email, logo/profile information."),
            ("Super Admin", "Platform-level management.", "Dealership oversight and platform admin functions."),
            ("AI Assistant", "Helps query operations.", "Ask about inventory, sales, and profit context from within the app."),
        ]),
        PageBreak(),
        h("4. Inventory and Vehicle Management"),
        p("Inventory is the starting point for the operational workflow. Each vehicle record stores key identification, purchase, cost, status, and document information."),
        *bullets([
            "Vehicle fields include VIN, make, model, year, mileage, color, purchase date, title number, and status.",
            "Purchase data includes seller name/address, purchase price, buyer fee, transport, inspection, registration, payment method, and total purchase cost.",
            "Vehicle status can move through Available, Reserved, Sold, or Returned depending on business activity.",
            "Documents are tracked with flags for generated Used Vehicle Record, source document, and Bill of Sale.",
            "Vehicle detail dialog provides tabs for overview, repairs, advertising, sale processing, documents, and customer viewing notes.",
        ]),
        h("5. Sales and Profit Workflow"),
        p("Sales can be created manually from a vehicle detail screen or automatically when a Bill of Sale document is processed. The sale stores buyer information, sale date, sale price, payment method, and document archive data."),
        *kv_table([
            ("Profit formula", "Sale price - purchase cost - repair cost."),
            ("Sale action", "Marks the vehicle as Sold and creates or updates the sale record."),
            ("Document update", "Regenerates the Used Vehicle Record with disposition details."),
            ("Customer update", "Creates or updates a customer record with contact, category, and linked vehicle metadata."),
            ("Bill of Sale", "Can be uploaded, previewed, downloaded, and stored as base64 document data."),
        ]),
        h("6. Customers Section"),
        p("The Customers section stores people connected to the dealership. It supports buyers imported from sales and manual customers such as visitors, leads, and follow-ups."),
        *bullets([
            "Manual customer creation with first name, last name, phone, email, address, city, state, and zip.",
            "Customer categories: Bought Vehicle, Came for Visit, Lead, Follow Up, and Other.",
            "Vehicle linking from Inventory with search by VIN, make, model, year, or status.",
            "Main customer search across name, contact number, email, category, address, and linked vehicle.",
            "Sales import creates or updates customer records from existing sale data.",
            "Existing customers can be edited to update contact details, category, and vehicle link.",
        ]),
        h("7. Document Processing and Registry"),
        p("The system includes document workflows for dealership paperwork. Purchase/source documents and Bills of Sale can be processed to extract vehicle and transaction details."),
        *bullets([
            "Document parser extracts VIN, year, make, model, title information, seller/source details, buyer/disposition details, dates, and prices.",
            "Used Vehicle Record PDF generation fills acquisition and disposition sections.",
            "Registry keeps VIN-based document records with source file name, document type, purchase details, and sale/disposition details.",
            "Document download and preview functions let users access records without manually searching file storage.",
            "Bulk import tooling can align purchase and sale documents to inventory records.",
        ]),
        h("8. Financial and Operational Modules"),
        *feature_table([
            ("Repairs", "Captures vehicle-specific reconditioning costs.", "Repair shop, parts cost, labor cost, repair date, description."),
            ("Advertising", "Tracks marketing spend and optional vehicle association.", "Campaign name, platform, start/end dates, amount spent, linked vehicle."),
            ("Business Expenses", "Captures non-vehicle operating expenses.", "Category, amount, date, notes."),
            ("Cash Flow", "Summarizes money movement.", "Income and cost visibility for managers/admins."),
            ("Reports", "Provides management exports and summaries.", "Revenue reports, unit counts, gross revenue, net profit, buyer breakdowns."),
        ]),
        h("9. User Roles and Access"),
        *kv_table([
            ("Staff", "Operational access to inventory, sales, used forms, customers, and day-to-day records. Profit can be masked in some views."),
            ("Manager", "Broader access to registry, reports, customers, and sales management functions."),
            ("Admin", "Full dealership management including team analytics, settings, reports, customers, inventory, and operations."),
            ("Super Admin", "Platform-level administration across dealerships."),
        ]),
        h("10. Technical Architecture"),
        *kv_table([
            ("Frontend", "React, TypeScript, Vite, React Router, TanStack Query, Tailwind/shadcn-style UI components."),
            ("Backend", "Node.js, Express routes, authentication middleware, tenant injection middleware, file upload handling."),
            ("Database", "MongoDB through Prisma Client with models for dealership, users, vehicles, sales, purchases, repairs, customers, expenses, advertising, and registry."),
            ("Document services", "Document parser and used vehicle PDF service for OCR/AI extraction and generated paperwork."),
            ("Caching", "In-memory route cache for selected list endpoints such as vehicles and sales."),
            ("Security", "JWT authentication, role-aware protected routes, helmet, CORS, rate limiting, and dealership isolation."),
        ]),
        PageBreak(),
        h("11. Key Data Models"),
        *feature_table([
            ("Dealership", "Tenant container.", "Users, vehicles, sales, purchases, repairs, customers, documents, expenses."),
            ("User", "Authenticated app user.", "Email, password, name, role, dealership relation."),
            ("Vehicle", "Inventory item.", "VIN, make/model/year, mileage, status, title number, purchase, sale, repairs."),
            ("Purchase", "Acquisition record.", "Seller, purchase price, fees, total cost, document data."),
            ("Sale", "Disposition record.", "Customer name, phone, address, sale date, sale price, payment, profit, Bill of Sale."),
            ("Customer", "Buyer/visitor/lead.", "Name, email, phone, address, license, notes metadata."),
            ("DocumentRegistry", "Compliance document record.", "Vehicle identity, acquisition and disposition fields, document base64."),
            ("Repair", "Reconditioning record.", "Vehicle, shop, parts, labor, date, description."),
            ("Expense/Advertising", "Cost tracking.", "Business cost and campaign spend records."),
        ]),
        h("12. Recent Customer Enhancements"),
        *bullets([
            "Customers route is mounted under /api/customers.",
            "Customers page is available in desktop sidebar and mobile navigation.",
            "Sales and Bill of Sale flows create or update customers automatically.",
            "Manual Add Customer workflow supports categories and inventory vehicle linking.",
            "Customer import from sales updates existing customer records instead of only creating new ones.",
            "Customer categories and vehicle links are stored in the existing notes field to avoid requiring an immediate database migration.",
        ]),
        h("13. Operational Notes"),
        *bullets([
            "Restart the backend server after backend route changes.",
            "Run npm run build after frontend changes to verify TypeScript and Vite production build.",
            "If Prisma schema changes are made, regenerate Prisma Client before running the server.",
            "Avoid pushing local changes to GitHub unless explicitly requested.",
            "Keep customer contact data accurate because it is reused across sales records and customer follow-up workflows.",
        ]),
        h("14. End-to-End Example"),
        *numbered([
            "Add a vehicle to Inventory from purchase details or source document.",
            "Attach repair bills and advertising spend as work is completed.",
            "Upload a Bill of Sale or manually process the sale from the vehicle record.",
            "The system marks the vehicle Sold, calculates profit, updates the Used Vehicle Record, and saves the Bill of Sale.",
            "The buyer appears in Customers as Bought Vehicle and can be edited with email, phone, category, and vehicle link.",
            "Managers review Sales, Reports, Cash Flow, and Dashboard totals.",
        ]),
    ]

    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    print(OUT)


if __name__ == "__main__":
    main()
