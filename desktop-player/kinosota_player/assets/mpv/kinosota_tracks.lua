-- KINOSOTA Player: the audio / subtitle track menu, drawn by mpv's own OSD.
--
-- It looks and behaves like the select.lua menu of mpv >= 0.39, which the bundled libmpv 0.35
-- (Debian 12) does not have: «Select an audio track:» / «Select a subtitle track:» and one
-- ●/○ line per track, «Title (lang codec 6ch 48 kHz) [default]». The right click on the OSC
-- audio / subtitle button opens it (the bundled osc.lua sends «script-message-to
-- kinosota_tracks open audio|sub»). The wheel and the arrows move the highlight, a left click or
-- Enter switches the track in place (no reload), Esc, a right click or a click outside closes it.
-- The host is told with «script-message kinosota-menu open|closed», so it can hand the mouse
-- wheel to the menu instead of the volume while it is on screen.

local msg = require 'mp.msg'

local PROMPTS = {audio = 'Select an audio track:', sub = 'Select a subtitle track:'}
local PROPERTIES = {audio = 'aid', sub = 'sid'}
local EMPTY = {audio = 'No available audio tracks', sub = 'No available subtitle tracks'}
local SUBTITLES_OFF = 'Выключить субтитры'
local FLAGS = {'default', 'forced', 'external'}
local MAX_ROWS = 12
local STATE_MESSAGE = 'kinosota-menu'
-- The wheel wins over the pointer. A hand turning the wheel always nudges the mouse by a pixel or two, and every
-- such MOUSE_MOVE used to put the highlight back on the line under the (now scrolled) cursor: the list jumped
-- forward and back. After a wheel step the pointer is ignored until it is WHEEL_HOVER_LOCK seconds later AND
-- really moved more than WHEEL_HOVER_SLOP OSD pixels away from where the wheel was last turned.
local WHEEL_HOVER_LOCK = 0.35
local WHEEL_HOVER_SLOP = 10
local BACKGROUND, BACKGROUND_ALPHA = '0E0B07', '30'  -- ASS colours are &HBBGGRR&: #070b0e, slightly see-through.
local TEXT, FOCUS_TEXT, FOCUS_BACKGROUND = 'FFFFFF', '222222', 'FFFFFF'

local overlay = mp.create_osd_overlay('ass-events')
local menu = nil    -- {kind, items, focus, first}
local layout = nil  -- Geometry of the menu on screen, for the mouse.
local wheel_lock = nil  -- {deadline, x, y}: the pointer is ignored after a wheel step (WHEEL_HOVER_*).
local close, choose

local function int(value)
    return math.floor(value + 0.5)
end

local function number_text(value)
    local text = string.format('%.3f', value):gsub('0+$', ''):gsub('%.$', '')
    return text
end

local function text_length(text)
    local _, count = text:gsub('[^\128-\191]', '')
    return count
end

local function ass_escape(text)
    text = tostring(text)
    text = text:gsub('\\', '\\\239\187\191')
    text = text:gsub('{', '\\{')
    text = text:gsub('}', '\\}')
    text = text:gsub('\r?\n', '\\N')
    return text
end

-- Tracks ---------------------------------------------------------------------------------------------------------
local function format_track(track)
    local details = {}
    local function add(value)
        if value ~= nil and value ~= '' then
            details[#details + 1] = tostring(value)
        end
    end
    add(track.lang)
    add(track.codec)
    if track['demux-channel-count'] then
        add(track['demux-channel-count'] .. 'ch')
    end
    if track.type == 'audio' then
        add(track['codec-profile'])
    end
    if track['demux-samplerate'] then
        add(number_text(track['demux-samplerate'] / 1000) .. ' kHz')
    end
    local bitrate = track['demux-bitrate'] or track['hls-bitrate']
    if bitrate then
        add(string.format('%.0f', bitrate / 1000) .. ' kbps')
    end
    local label = track.selected and '●' or '○'
    if track.title and track.title ~= '' then
        label = label .. ' ' .. track.title
    end
    if #details > 0 then
        label = label .. ' (' .. table.concat(details, ' ') .. ')'
    end
    for _, flag in ipairs(FLAGS) do
        if track[flag] then
            label = label .. ' [' .. flag .. ']'
        end
    end
    return label
end

local function build_items(kind)
    local items, any_selected = {}, false
    for _, track in ipairs(mp.get_property_native('track-list') or {}) do
        if track.type == kind and track.id then
            items[#items + 1] = {id = track.id, label = format_track(track), selected = track.selected == true}
            any_selected = any_selected or track.selected == true
        end
    end
    if kind == 'sub' and #items > 0 then
        table.insert(items, 1, {off = true, selected = not any_selected,
                                label = (any_selected and '○ ' or '● ') .. SUBTITLES_OFF})
    end
    return items
end

-- Drawing --------------------------------------------------------------------------------------------------------
local function osd_size()
    local dims = mp.get_property_native('osd-dimensions')
    local w, h = dims and dims.w or 0, dims and dims.h or 0
    if w <= 0 or h <= 0 then
        return 1280, 720
    end
    return w, h
end

local function compute_layout()
    local w, h = osd_size()
    local font = math.max(16, int(h * 0.034))
    local row = int(font * 1.45)
    local pad = int(font * 0.8)
    local gap = int(row * 0.25)
    local fits = math.max(1, math.floor((h - 2 * pad - row - gap) / row))
    local rows = math.max(1, math.min(#menu.items, MAX_ROWS, fits))
    local longest = text_length(PROMPTS[menu.kind]) + 2
    for _, item in ipairs(menu.items) do
        longest = math.max(longest, text_length(item.label))
    end
    local width = int(math.min(w - 2 * pad, math.max(font * 16, longest * font * 0.56 + 2 * pad)))
    local height = (rows + 1) * row + 2 * pad + gap
    local x0, y0 = int((w - width) / 2), int((h - height) / 2)
    return {w = w, h = h, font = font, row = row, pad = pad, rows = rows, x0 = x0, y0 = y0,
            x1 = x0 + width, y1 = y0 + height, list_top = y0 + pad + row + gap}
end

local function keep_focus_visible()
    local rows = layout.rows
    if menu.focus < menu.first then
        menu.first = menu.focus
    elseif menu.focus > menu.first + rows - 1 then
        menu.first = menu.focus - rows + 1
    end
    menu.first = math.max(1, math.min(menu.first, #menu.items - rows + 1))
end

local function box(x0, y0, x1, y1, color, alpha)
    return string.format('{\\an7\\pos(0,0)\\bord0\\shad0\\1c&H%s&\\1a&H%s&\\p1}m %d %d l %d %d l %d %d l %d %d{\\p0}',
                         color, alpha, int(x0), int(y0), int(x1), int(y0), int(x1), int(y1), int(x0), int(y1))
end

local function line(x, y, text, color)
    return string.format('{\\an4\\pos(%d,%d)\\q2\\fs%d\\bord0\\shad0\\1c&H%s&\\1a&H00&}%s',
                         int(x), int(y), layout.font, color, ass_escape(text))
end

local function render()
    if not menu then
        return
    end
    layout = compute_layout()
    keep_focus_visible()
    local x = layout.x0 + layout.pad
    local ass = {box(layout.x0, layout.y0, layout.x1, layout.y1, BACKGROUND, BACKGROUND_ALPHA),
                 line(x, layout.y0 + layout.pad + layout.row / 2, PROMPTS[menu.kind] .. ' |', TEXT)}
    for i = 0, layout.rows - 1 do
        local index = menu.first + i
        local item = menu.items[index]
        if not item then
            break
        end
        local top = layout.list_top + i * layout.row
        local color = TEXT
        if index == menu.focus then
            ass[#ass + 1] = box(layout.x0 + layout.pad / 2, top, layout.x1 - layout.pad / 2, top + layout.row,
                                FOCUS_BACKGROUND, '00')
            color = FOCUS_TEXT
        end
        ass[#ass + 1] = line(x, top + layout.row / 2, item.label, color)
    end
    overlay.res_x, overlay.res_y = layout.w, layout.h
    overlay.data = table.concat(ass, '\n')
    overlay:update()
end

-- Input ----------------------------------------------------------------------------------------------------------
local function mouse_xy()
    local pos = mp.get_property_native('mouse-pos')
    if type(pos) == 'table' and pos.x then
        return pos.x, pos.y
    end
    if mp.get_mouse_pos then
        return mp.get_mouse_pos()
    end
    return -1, -1
end

-- The menu line under (x, y), and whether the point is on the menu at all.
local function row_at(x, y)
    if not layout or x < layout.x0 or x > layout.x1 or y < layout.y0 or y > layout.y1 then
        return nil, false
    end
    local offset = y - layout.list_top
    if offset < 0 then
        return nil, true
    end
    local i = math.floor(offset / layout.row)
    if i >= layout.rows or not menu.items[menu.first + i] then
        return nil, true
    end
    return menu.first + i, true
end

local function move(delta)
    if not menu then
        return
    end
    local focus = math.max(1, math.min(#menu.items, menu.focus + delta))
    if focus ~= menu.focus then
        menu.focus = focus
        msg.verbose('focus ' .. focus)
    end
    render()
end

local function wheel(delta)
    if not menu then
        return
    end
    local x, y = mouse_xy()
    wheel_lock = {deadline = mp.get_time() + WHEEL_HOVER_LOCK, x = x, y = y}
    move(delta)
end

-- True while the pointer must not move the highlight: right after a wheel step, until a real mouse move.
local function wheel_locked(x, y)
    if not wheel_lock then
        return false
    end
    local moved = math.abs(x - wheel_lock.x) > WHEEL_HOVER_SLOP or math.abs(y - wheel_lock.y) > WHEEL_HOVER_SLOP
    if moved and mp.get_time() >= wheel_lock.deadline then
        wheel_lock = nil
        return false
    end
    return true
end

local function hover()
    if not menu then
        return
    end
    local x, y = mouse_xy()
    if wheel_locked(x, y) then
        return
    end
    local index = row_at(x, y)
    if index and index ~= menu.focus then
        menu.focus = index
        msg.verbose('focus ' .. index)
        render()
    end
end

local function click()
    if not menu then
        return
    end
    local index, inside = row_at(mouse_xy())
    if index then
        choose(index, true)
    elseif not inside then
        close(true)
    end
end

local function nothing() end

local REPEAT = {repeatable = true}
local BINDINGS = {
    {'ESC', function() close() end},
    {'ENTER', function() choose(menu and menu.focus) end},
    {'KP_ENTER', function() choose(menu and menu.focus) end},
    {'UP', function() move(-1) end, REPEAT},
    {'DOWN', function() move(1) end, REPEAT},
    {'WHEEL_UP', function() wheel(-1) end, REPEAT},
    {'WHEEL_DOWN', function() wheel(1) end, REPEAT},
    {'PGUP', function() move(-MAX_ROWS) end, REPEAT},
    {'PGDWN', function() move(MAX_ROWS) end, REPEAT},
    {'HOME', function() move(-math.huge) end},
    {'END', function() move(math.huge) end},
    {'MOUSE_MOVE', hover},
    {'MBTN_LEFT', click},
    {'MBTN_LEFT_DBL', nothing},   -- Never toggles fullscreen under the menu.
    {'MBTN_RIGHT', function() close() end},
    {'MBTN_RIGHT_DBL', nothing},
    {'MBTN_MID', nothing},
}

-- Open / choose / close ------------------------------------------------------------------------------------------
local function open(kind)
    if not PROMPTS[kind] then
        msg.warn('Unknown track menu: ' .. tostring(kind))
        return
    end
    local items = build_items(kind)
    if #items == 0 then
        mp.osd_message(EMPTY[kind])
        return
    end
    local reopened = menu ~= nil
    menu = {kind = kind, items = items, focus = 1, first = 1}
    wheel_lock = nil
    for index, item in ipairs(items) do
        if item.selected then
            menu.focus = index
            break
        end
    end
    if not reopened then
        for _, binding in ipairs(BINDINGS) do
            mp.add_forced_key_binding(binding[1], 'kinosota-menu-' .. binding[1], binding[2], binding[3])
        end
        mp.commandv('script-message-to', 'osc', 'osc-visibility', 'never', 'no-osd')
        mp.commandv('script-message', STATE_MESSAGE, 'open', kind)
    end
    msg.verbose('menu ' .. PROMPTS[kind])
    for _, item in ipairs(items) do
        msg.verbose('row ' .. item.label)
    end
    render()
end

close = function(after_click)
    if not menu then
        return
    end
    menu, layout, wheel_lock = nil, nil, nil
    overlay:remove()
    for _, binding in ipairs(BINDINGS) do
        mp.remove_key_binding('kinosota-menu-' .. binding[1])
    end
    if after_click then  -- The second click of a double click must not toggle fullscreen either.
        mp.add_forced_key_binding('MBTN_LEFT_DBL', 'kinosota-menu-after-click', nothing)
        mp.add_timeout(0.5, function() mp.remove_key_binding('kinosota-menu-after-click') end)
    end
    mp.commandv('script-message-to', 'osc', 'osc-visibility', 'auto', 'no-osd')
    mp.commandv('script-message', STATE_MESSAGE, 'closed')
    msg.verbose('menu closed')
end

choose = function(index, after_click)
    local item = menu and menu.items[index or 0]
    if not item then
        return
    end
    local property = PROPERTIES[menu.kind]
    close(after_click)
    if item.off then
        mp.set_property('sid', 'no')
    else
        mp.set_property_number(property, item.id)
    end
    msg.verbose('chose ' .. property .. '=' .. (item.off and 'no' or tostring(item.id)))
end

local function refresh()
    if not menu then
        return
    end
    local focused = menu.items[menu.focus]
    local items = build_items(menu.kind)
    if #items == 0 then
        close()
        return
    end
    menu.items, menu.focus = items, math.min(menu.focus, #items)
    for index, item in ipairs(items) do
        if focused and item.id == focused.id then
            menu.focus = index
        end
    end
    render()
end

mp.register_script_message('open', open)
mp.register_script_message('close', function() close() end)
mp.register_script_message('toggle', function(kind)
    if menu and menu.kind == kind then
        close()
    else
        open(kind)
    end
end)
mp.observe_property('track-list', 'native', refresh)
mp.observe_property('osd-dimensions', 'native', function() render() end)
mp.register_event('end-file', function() close() end)
