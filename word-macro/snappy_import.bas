Attribute VB_Name = "modSnappyImport"
Option Explicit

' ============================================================================
' snappy_import
'
' Reads one Snappy Tool export batch (a manifest-<batchid>.json plus its
' fig-<batchid>-NN.jpg files) and inserts every row as a borderless,
' fixed-width Word table: one column per image (plus narrow spacer columns
' matching the page profile's gutter), with a numbered "Figure N: caption"
' line under each image. Every image is inserted at exactly the widthMm the
' manifest states, so Word never rescales it.
'
' Every "Export all" in Snappy Tool writes its own uniquely-named manifest
' (and images) into the save folder instead of overwriting one shared
' manifest.json, so several batches — e.g. photos added on different days of
' the same report — can sit in one folder without clashing. Run this macro
' once per batch, picking the matching manifest-*.json file each time.
'
' This is the downstream counterpart to Snappy Tool's manifest.json (see
' src/manifest.js in the snappy_tool repo). It replaces the older
' InsertFiguresWithCaptions macro, which did its own file picking, fixed every
' image to the same width, and prompted for captions one at a time — none of
' that is needed now that the manifest carries per-image width and caption text.
'
' To install: Alt+F11 in Word -> File -> Import File... -> this .bas file.
' To run: Alt+F8 -> snappy_import -> Run. Put the cursor where you want the
' figures inserted first, then pick the manifest-*.json for that batch.
' ============================================================================

Private jStr As String
Private jPos As Long
Private jLen As Long

Public Sub snappy_import()
    ' === Configurable settings ===
    Const CAPTION_LABEL As String = "Figure"
    Const USE_CHAPTER_NUMBERING As Boolean = True
    Const CHAPTER_HEADING_LEVEL As Integer = 1   ' restarts numbering at each Heading 1
    Const BORDER_WEIGHT_PT As Single = 1#        ' border thickness in points, matches old macro
    ' Set this to your usual Snappy Tool save folder so the file picker opens
    ' there instead of wherever Word last was. Leave blank to just use Word's
    ' own last-used location.
    Const DEFAULT_FOLDER As String = ""

    Dim manifestPath As String
    manifestPath = PickManifestFile(DEFAULT_FOLDER)
    If manifestPath = "" Then Exit Sub

    Dim folderPath As String
    folderPath = Left(manifestPath, InStrRev(manifestPath, "\"))

    Dim root As Object
    Set root = JsonParse(ReadFileText(manifestPath))

    If Not root.Exists("rows") Then
        MsgBox "manifest.json doesn't look like a Snappy Tool export (no 'rows').", vbExclamation, "snappy_import"
        Exit Sub
    End If

    Dim gutterMm As Double
    gutterMm = 5 ' fallback if pageProfile is somehow missing
    If root.Exists("pageProfile") Then
        Dim profile As Object
        Set profile = root("pageProfile")
        If profile.Exists("gutterMm") Then gutterMm = profile("gutterMm")
    End If

    Dim rows As Object
    Set rows = root("rows")

    Dim figCount As Long
    figCount = 0

    Dim rowItem As Variant
    For Each rowItem In rows
        Dim images As Object
        Set images = rowItem("images")

        Dim imgCount As Long
        imgCount = images.Count
        If imgCount > 0 Then
            InsertFigureRow images, folderPath, gutterMm, CAPTION_LABEL, _
                USE_CHAPTER_NUMBERING, CHAPTER_HEADING_LEVEL, BORDER_WEIGHT_PT
            figCount = figCount + imgCount
        End If
    Next rowItem

    ActiveDocument.Fields.Update
    MsgBox figCount & " figure(s) inserted from manifest.", vbInformation, "snappy_import"
End Sub

' --- Builds one borderless table for a single manifest row: image cells on
' top, caption cells (with SEQ numbering) below, narrow spacer columns between
' images so the gutter is actually visible rather than just reserved in the math. ---
Private Sub InsertFigureRow(ByVal images As Object, ByVal folderPath As String, ByVal gutterMm As Double, _
        ByVal captionLabel As String, ByVal useChapterNumbering As Boolean, ByVal chapterLevel As Integer, _
        ByVal borderWeightPt As Single)

    Selection.TypeParagraph ' spacing before each figure block

    Dim imgCount As Long
    imgCount = images.Count
    Dim numCols As Long
    numCols = 2 * imgCount - 1 ' image, spacer, image, spacer, ..., image

    Dim tbl As Table
    Set tbl = ActiveDocument.Tables.Add(Range:=Selection.Range, NumRows:=2, NumColumns:=numCols)
    tbl.Borders.InsideLineStyle = wdLineStyleNone
    tbl.Borders.OutsideLineStyle = wdLineStyleNone
    tbl.AutoFitBehavior wdAutoFitFixed
    tbl.Rows.AllowBreakAcrossPages = False
    tbl.Rows.Alignment = wdAlignRowCenter
    tbl.TopPadding = 0
    tbl.BottomPadding = 0
    tbl.LeftPadding = 0
    tbl.RightPadding = 0

    Dim colNum As Long, imgIdx As Long
    Dim totalWidthMm As Double
    totalWidthMm = 0
    imgIdx = 0

    For colNum = 1 To numCols
        If colNum Mod 2 = 1 Then
            imgIdx = imgIdx + 1
            Dim imgItem As Object
            Set imgItem = images(imgIdx)

            Dim widthMm As Double
            widthMm = imgItem("widthMm")
            totalWidthMm = totalWidthMm + widthMm
            tbl.Columns(colNum).Width = Application.MillimetersToPoints(widthMm)

            PlaceImageCell tbl.Cell(1, colNum), folderPath & CStr(imgItem("file")), widthMm, borderWeightPt
            PlaceCaptionCell tbl.Cell(2, colNum), imgItem, captionLabel, useChapterNumbering, chapterLevel
        Else
            totalWidthMm = totalWidthMm + gutterMm
            tbl.Columns(colNum).Width = Application.MillimetersToPoints(gutterMm)
        End If
    Next colNum

    tbl.PreferredWidthType = wdPreferredWidthPoints
    tbl.PreferredWidth = Application.MillimetersToPoints(totalWidthMm)

    ' move past the table so the next row's table inserts after this one
    Selection.SetRange Start:=tbl.Range.End, End:=tbl.Range.End
    Selection.Collapse wdCollapseEnd
End Sub

Private Sub PlaceImageCell(ByVal targetCell As Cell, ByVal fullPath As String, ByVal widthMm As Double, ByVal borderWeightPt As Single)
    If Dir(fullPath) = "" Then
        targetCell.Range.Text = "[missing: " & fullPath & "]"
    Else
        Dim shp As InlineShape
        Set shp = targetCell.Range.InlineShapes.AddPicture(FileName:=fullPath, LinkToFile:=False, SaveWithDocument:=True)
        shp.LockAspectRatio = msoTrue
        shp.Width = Application.MillimetersToPoints(widthMm)
        shp.Line.Visible = msoTrue
        shp.Line.ForeColor.RGB = RGB(0, 0, 0)
        shp.Line.Weight = borderWeightPt
    End If
    targetCell.Range.Paragraphs(1).Alignment = wdAlignParagraphCenter
End Sub

Private Sub PlaceCaptionCell(ByVal targetCell As Cell, ByVal imgItem As Object, ByVal captionLabel As String, _
        ByVal useChapterNumbering As Boolean, ByVal chapterLevel As Integer)

    Dim capText As String
    capText = ""
    If imgItem.Exists("caption") Then capText = CStr(imgItem("caption"))

    ' Built via Selection, not a bare Range — this exactly mirrors the proven
    ' pattern from the old InsertFiguresWithCaptions macro. An early version of
    ' this used a Range object instead and the field results ended up displaced
    ' to the end of the caption text (e.g. "Figure -: Terminal12" instead of
    ' "Figure 2-1: Terminal") because Range doesn't reliably re-anchor itself
    ' across Fields.Add the way Selection does.
    targetCell.Range.Select
    Selection.Collapse wdCollapseStart

    Selection.TypeText captionLabel & " "

    If useChapterNumbering Then
        Selection.Fields.Add Range:=Selection.Range, Type:=wdFieldEmpty, Text:="STYLEREF " & chapterLevel & " \n", PreserveFormatting:=False
        Selection.Collapse wdCollapseEnd
        Selection.TypeText "-"
        Selection.Fields.Add Range:=Selection.Range, Type:=wdFieldEmpty, Text:="SEQ " & captionLabel & " \* ARABIC \s " & chapterLevel, PreserveFormatting:=False
        Selection.Collapse wdCollapseEnd
    Else
        Selection.Fields.Add Range:=Selection.Range, Type:=wdFieldEmpty, Text:="SEQ " & captionLabel & " \* ARABIC", PreserveFormatting:=False
        Selection.Collapse wdCollapseEnd
    End If

    If capText <> "" Then Selection.TypeText ": " & capText

    targetCell.Range.Paragraphs(1).Style = "Caption"
    targetCell.Range.Paragraphs(1).Alignment = wdAlignParagraphCenter
End Sub

Private Function PickManifestFile(ByVal defaultFolder As String) As String
    Dim fd As FileDialog
    Set fd = Application.FileDialog(msoFileDialogFilePicker)
    With fd
        .Title = "Select the Snappy Tool manifest to import (one per export batch)"
        .AllowMultiSelect = False
        .Filters.Clear
        .Filters.Add "Snappy Tool manifest", "*.json"
        If defaultFolder <> "" Then .InitialFileName = defaultFolder
        If .Show <> -1 Then
            PickManifestFile = ""
            Exit Function
        End If
        PickManifestFile = .SelectedItems(1)
    End With
End Function

' ============================================================================
' Minimal JSON parser (objects -> Scripting.Dictionary, arrays -> Collection).
' Self-contained so this macro needs no external library. Tailored to parse any
' valid JSON, not just Snappy Tool's manifest shape.
' ============================================================================

Private Function ReadFileText(ByVal path As String) As String
    Dim stm As Object
    Set stm = CreateObject("ADODB.Stream")
    stm.Type = 2 ' adTypeText
    stm.Charset = "utf-8"
    stm.Open
    stm.LoadFromFile path
    Dim result As String
    result = stm.ReadText
    stm.Close
    ' strip a leading UTF-8 BOM if present
    If Len(result) > 0 Then
        If AscW(Left(result, 1)) = 65279 Then result = Mid(result, 2)
    End If
    ReadFileText = result
End Function

Private Function JsonParse(ByVal s As String) As Object
    jStr = s
    jPos = 1
    jLen = Len(s)
    JsonSkipWs
    Set JsonParse = JsonParseObject()
End Function

Private Sub JsonSkipWs()
    Do While jPos <= jLen
        Dim c As String
        c = Mid(jStr, jPos, 1)
        If c = " " Or c = vbTab Or c = vbCr Or c = vbLf Then
            jPos = jPos + 1
        Else
            Exit Do
        End If
    Loop
End Sub

Private Sub JsonParseValue(ByRef outVal As Variant)
    JsonSkipWs
    Dim c As String
    c = Mid(jStr, jPos, 1)
    Select Case c
        Case "{"
            Set outVal = JsonParseObject()
        Case "["
            Set outVal = JsonParseArray()
        Case """"
            outVal = JsonParseString()
        Case "t"
            jPos = jPos + 4 ' true
            outVal = True
        Case "f"
            jPos = jPos + 5 ' false
            outVal = False
        Case "n"
            jPos = jPos + 4 ' null
            outVal = Null
        Case Else
            outVal = JsonParseNumber()
    End Select
End Sub

Private Function JsonParseObject() As Object
    Dim d As Object
    Set d = CreateObject("Scripting.Dictionary")
    jPos = jPos + 1 ' consume {
    JsonSkipWs
    If Mid(jStr, jPos, 1) = "}" Then
        jPos = jPos + 1
        Set JsonParseObject = d
        Exit Function
    End If
    Do
        JsonSkipWs
        Dim key As String
        key = JsonParseString()
        JsonSkipWs
        If Mid(jStr, jPos, 1) = ":" Then jPos = jPos + 1
        Dim val As Variant
        JsonParseValue val
        d.Add key, val
        JsonSkipWs
        If Mid(jStr, jPos, 1) = "," Then
            jPos = jPos + 1
        Else
            Exit Do
        End If
    Loop
    JsonSkipWs
    If Mid(jStr, jPos, 1) = "}" Then jPos = jPos + 1
    Set JsonParseObject = d
End Function

Private Function JsonParseArray() As Object
    Dim c As Collection
    Set c = New Collection
    jPos = jPos + 1 ' consume [
    JsonSkipWs
    If Mid(jStr, jPos, 1) = "]" Then
        jPos = jPos + 1
        Set JsonParseArray = c
        Exit Function
    End If
    Do
        Dim val As Variant
        JsonParseValue val
        c.Add val
        JsonSkipWs
        If Mid(jStr, jPos, 1) = "," Then
            jPos = jPos + 1
        Else
            Exit Do
        End If
    Loop
    JsonSkipWs
    If Mid(jStr, jPos, 1) = "]" Then jPos = jPos + 1
    Set JsonParseArray = c
End Function

Private Function JsonParseString() As String
    jPos = jPos + 1 ' consume opening quote
    Dim sb As String
    sb = ""
    Do While jPos <= jLen
        Dim ch As String
        ch = Mid(jStr, jPos, 1)
        If ch = """" Then
            jPos = jPos + 1
            Exit Do
        ElseIf ch = "\" Then
            Dim nextCh As String
            nextCh = Mid(jStr, jPos + 1, 1)
            Select Case nextCh
                Case """": sb = sb & """"
                Case "\": sb = sb & "\"
                Case "/": sb = sb & "/"
                Case "n": sb = sb & vbLf
                Case "t": sb = sb & vbTab
                Case "r": sb = sb & vbCr
                Case "b": sb = sb & Chr(8)
                Case "f": sb = sb & Chr(12)
                Case "u"
                    Dim hex As String
                    hex = Mid(jStr, jPos + 2, 4)
                    sb = sb & ChrW(CLng("&H" & hex))
                    jPos = jPos + 4
                Case Else
                    sb = sb & nextCh
            End Select
            jPos = jPos + 2
        Else
            sb = sb & ch
            jPos = jPos + 1
        End If
    Loop
    JsonParseString = sb
End Function

Private Function JsonParseNumber() As Double
    Dim startPos As Long
    startPos = jPos
    Do While jPos <= jLen And InStr("0123456789+-.eE", Mid(jStr, jPos, 1)) > 0
        jPos = jPos + 1
    Loop
    JsonParseNumber = Val(Mid(jStr, startPos, jPos - startPos))
End Function
