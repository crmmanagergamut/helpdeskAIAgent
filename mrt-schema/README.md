# PMS MRT schema (Property Management print tables)

Source: `source-FMS_Print_Data_DTO.xlsx` (the team's "FMS Print Data(DTO)" file; sheets Invoice, Receipt, Credit Note, Booking).
`pms-mrt-schema.jsonl` holds one line per field: document, section, srl, table (schema name), field, type, description, example (375 rows: Invoice 177, Receipt 71, Credit Note 59, Booking 68).

Rule: when a Property Management client asks to add a field to the MRT of an invoice, receipt, credit note or booking, find it here and give the client the Table name, Field name, Data Type and Description. The schema must be added only in that table, with that exact name and data type. If a field is not in the file, say it is not in the standard schema. Do not guess.

Search: `node mrt-schema/search-mrt.js "booking date" --doc invoice`

Notes from the file: `businessunitExtrainfo` / `companyExtraInfo` are dynamic fields (key/value from the extra info), not fixed columns.
This folder is separate from the help-page KB and the ticket-learning layer; delete it to remove.
